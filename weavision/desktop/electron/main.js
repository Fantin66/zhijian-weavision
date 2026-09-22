const { app, BrowserWindow, shell, nativeTheme, ipcMain, dialog, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const windowsIcons = require("./windows-icons");

/* K8.5: 设置 AppUserModelID——安装版从 .lnk 快捷方式启动时，Windows 任务栏
   按 AUMID 匹配窗口和快捷方式。不设 AUMID 则任务栏用快捷方式图标而非窗口图标，
   win.setIcon() 切换任务栏图标在安装版无效果。设为与 package.json appId 一致。 */
if (process.platform === "win32") app.setAppUserModelId("com.weavision.zhijian");

/* K8.5: 启动时按版本号清理 V8 代码缓存——安装版覆盖升级时旧缓存可能导致
   "代码正确但行为异常"。版本号变化时清一次 Cache/Code Cache/GPUCache。 */
(function clearCacheIfVersionChanged() {
  try {
    var ud = app.getPath("userData");
    var flag = path.join(ud, ".code-ver");
    var cur = app.getVersion();
    var prev = null;
    try { prev = fs.readFileSync(flag, "utf-8").trim(); } catch (e) {}
    if (prev === cur) return;
    ["Cache", "Code Cache", "GPUCache"].forEach(function (d) {
      var p = path.join(ud, d);
      try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {}
    });
    try { fs.writeFileSync(flag, cur, "utf-8"); } catch (e) {}
  } catch (e) {}
})();

let win = null;
let pendingFantinPath = null;  /* G8: 文件关联 — 双击 .fantin 时暂存路径 */
let isQuitting = false;  /* G11: 退出确认标志 */
let quitFallbackTimer = null;  /* I5-fix: 关闭兜底定时器 */

/* G8: 从 argv 中提取 .fantin 文件路径 */
function extractFantinFromArgv(argv) {
  for (var i = 1; i < argv.length; i++) {
    if (argv[i] && argv[i].toLowerCase().endsWith(".fantin")) return argv[i];
  }
  return null;
}

/* G11: 任务栏图标风格 — 扁平化(带框,分亮暗) vs 轻拟物(无框透明,单一) */
let taskbarPreset = 3, taskbarStyle = "clean";
/* Serialize updates so rapid selections and theme changes cannot restore an older icon. */
let iconUpdateQueue = Promise.resolve();
function applyTaskbarIcon() {
  const preset = taskbarPreset, style = taskbarStyle;
  const job = iconUpdateQueue.then(() => applyTaskbarIconNow(preset, style));
  iconUpdateQueue = job.catch(() => {});
  return job.catch(e => ({ ok: false, error: e.message }));
}
async function updateShortcutIcons(nativeImg, baseName) {
  if (process.platform !== "win32") return { errors: [] };
  const icoDir = path.join(app.getPath("userData"), "icons");
  fs.mkdirSync(icoDir, { recursive: true });
  const icoPath = path.join(icoDir, baseName + ".ico");
  fs.writeFileSync(icoPath, windowsIcons.toIco(nativeImg));
  const executable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const roots = [app.getPath("desktop"), path.join(app.getPath("appData"), "Microsoft/Windows/Start Menu"),
    path.join(app.getPath("appData"), "Microsoft/Internet Explorer/Quick Launch/User Pinned")];
  if (process.env.PUBLIC) roots.push(path.join(process.env.PUBLIC, "Desktop"));
  if (process.env.ProgramData) roots.push(path.join(process.env.ProgramData, "Microsoft/Windows/Start Menu"));
  const result = windowsIcons.updateShortcuts(shell, roots, executable, icoPath);
  if (win && !win.isDestroyed()) win.setAppDetails({ appId: windowsIcons.APP_ID,
    appIconPath: icoPath, appIconIndex: 0, relaunchCommand: '"' + executable + '"', relaunchDisplayName: "织见" });
  await windowsIcons.runPowerShell(windowsIcons.REFRESH);
  return result;
}
async function applyTaskbarIconNow(preset, style) {
  if (!win || win.isDestroyed()) return { ok: false, error: "no window" };
  const isDark = nativeTheme.shouldUseDarkColors;
  /* I5-fix: 打包后 __dirname 在 app.asar 内没有 icons，必须读 extraResources 的 resourcesPath/icons（与 set-fantin-icon 同一分支） */
  const iconsDir = app.isPackaged ? path.join(process.resourcesPath, "icons") : path.join(__dirname, "icons");
  let iconPath;
  if (style === "clean") {
    iconPath = path.join(iconsDir, "clean-" + preset + ".png");
  } else {
    iconPath = path.join(iconsDir, "flat-" + preset + "-" + (isDark ? "dark" : "light") + ".png");
  }
  if (!fs.existsSync(iconPath)) {
    console.error("taskbar icon file missing:", iconPath);
    return { ok: false, error: "file not found: " + iconPath };
  }
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    console.error("taskbar icon empty after load:", iconPath);
    return { ok: false, error: "image empty: " + iconPath };
  }
  /* I7-fix: 裁掉透明边距让图标内容填满任务栏——轻拟物图标有大面积透明边距，
     不裁的话在任务栏上会显得很小。三层降级：crop() → 手动 bitmap 裁剪 → 原图直接用 */
  var finalImg = img;
  try {
    var size = img.getSize();
    var bmp = img.getBitmap();
    var bpp = 4;
    var bmpW = Math.round(bmp.length / bpp / size.height);
    if (bmpW <= 0 || bmpW * size.height * bpp !== bmp.length) {
      bmpW = Math.round(Math.sqrt(bmp.length / bpp));
    }
    var bmpH = Math.round(bmp.length / bpp / bmpW);
    /* 扫描非透明像素的边界框 */
    var minX = bmpW, minY = bmpH, maxX = -1, maxY = -1;
    for (var y = 0; y < bmpH; y++) {
      for (var x = 0; x < bmpW; x++) {
        if (bmp[(y * bmpW + x) * bpp + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) {
      /* 以内容中心为基准取正方形裁剪区 */
      var cw = maxX - minX + 1, ch = maxY - minY + 1;
      var sq = Math.max(cw, ch);
      var ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
      var half = sq / 2;
      var bx = Math.max(0, Math.min(bmpW - sq, Math.round(ccx - half)));
      var by = Math.max(0, Math.min(bmpH - sq, Math.round(ccy - half)));
      var bs = Math.round(sq);
      var sx = size.width / bmpW, sy = size.height / bmpH;
      var cropRect = { x: Math.round(bx * sx), y: Math.round(by * sy), width: Math.round(bs * sx), height: Math.round(bs * sy) };
      /* 方案 A: 用 nativeImage.crop()（Electron 28+ 才有） */
      if (typeof img.crop === "function") {
        var cropped = img.crop(cropRect);
        if (!cropped.isEmpty()) finalImg = cropped.resize({ width: 256, height: 256 });
      }
      /* 方案 B: 手动从 raw RGBA bitmap 提取子区域 → createFromBuffer */
      if (finalImg === img) {
        var croppedBmp = Buffer.alloc(bs * bs * bpp);
        for (var row = 0; row < bs; row++) {
          bmp.copy(croppedBmp, row * bs * bpp, (by + row) * bmpW * bpp + bx * bpp, (by + row) * bmpW * bpp + (bx + bs) * bpp);
        }
        var cropped2 = nativeImage.createFromBuffer(croppedBmp, { width: bs, height: bs });
        if (!cropped2.isEmpty()) finalImg = cropped2.resize({ width: 256, height: 256 });
      }
    }
  } catch (e) {
    console.error("taskbar crop fallback:", e.message);
  }
  win.setIcon(finalImg);
  const shortcuts = await updateShortcutIcons(finalImg, path.basename(iconPath, ".png"));
  if (process.platform === "win32" && win && !win.isDestroyed()) {
    const wasMinimized = win.isMinimized();
    win.setSkipTaskbar(true);
    win.setSkipTaskbar(false);
    if (wasMinimized) win.minimize();
  }
  return { ok: true, path: iconPath, warning: shortcuts.errors.length
    ? "任务栏图标已更新，部分公共快捷方式无写入权限：" + shortcuts.errors.join("；") : undefined };
}

/* K5: 自动安装 zhijian-ai skill 到用户 ~/.agents/skills/ 目录。
   skill 覆盖两个方向：AI 操作画布 + AI 读取 .fantin 生成报告。 */
function installFantinSkill() {
  try {
    var skillSrc = path.join(process.resourcesPath, ".agents", "skills", "zhijian-ai");
    if (!fs.existsSync(skillSrc)) return;
    var homeDir = app.getPath("home");
    var skillDst = path.join(homeDir, ".agents", "skills", "zhijian-ai");
    const result=require('./skill-install').installSkill(skillSrc,skillDst);
    console.log('L1 AI skill update:',JSON.stringify(result));
  } catch (e) {
    console.error("skill install failed:", e.message);
  }
}

/* macOS 应用菜单：mac 上必须设置，否则 Cmd+Q / Cmd+H / Cmd+W 等系统级快捷键不生效。
   Windows 走无边框窗口、本就没有系统菜单栏，这里直接返回不做任何事。 */
function buildAppMenu() {
  if (process.platform !== "darwin") return;
  const runInPage = (js) => { if (win && !win.isDestroyed()) win.webContents.executeJavaScript(js); };
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      {
        label: "视图",
        submenu: [
          {
            label: "沉浸模式",
            accelerator: "Control+Command+F",
            click() { runInPage("if(typeof toggleImmersive==='function')toggleImmersive();"); }
          },
          { label: "全屏", role: "togglefullscreen" },
          { type: "separator" },
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" }
        ]
      },
      { role: "windowMenu" }
    ]));
  } catch (e) { /* 菜单不可用时静默降级，不影响主功能 */ }
}
function createWindow() {
  const isMac = process.platform === "darwin";
  win = new BrowserWindow(Object.assign({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "织见 · 思维关系板",
    icon: path.join(__dirname, "icon.png"),
    /* 窗口底色必须与 splash 的底色同值：页面首帧渲染之前，屏幕上显示的就是这个颜色。
       原先写死 #ffffff，暗色模式下启动会先闪一帧白，再等渲染层的 applyTheme() 把
       splash 变暗——这就是"启动闪白"的第一个来源。
       #111118 / #f0f2f5 分别取自 styles.css 里 #splashScreen 的暗色/亮色背景。 */
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#111118" : "#f0f2f5",
  }, isMac
    /* macOS：保留原生红绿灯（渲染层不再画窗口按钮）。
       位置依据：顶栏 --topbar-h 在 mac 下为 58px，窗口按钮直径约 14px，
       令红绿灯中心落在顶栏中线（29px）→ y = 29 - 7 ≈ 22；x=16 与顶栏左内边距对齐。
       渲染层已给顶栏留出 84px 左内边距容纳这三个按钮。 */
    ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 22 } }
    /* Windows/Linux：维持无边框 + 渲染层自绘的三色窗口按钮 */
    : { frame: false },
  {
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false, /* H2 任务10: 代码统一用 <iframe> 不用 <webview>，关闭以省一个潜在独立进程路径 */
    },
  }));

  /* G9: 打包后用 extraResources 路径，开发时用相对路径 */
  const htmlPath = app.isPackaged
    ? path.join(process.resourcesPath, "index.html")
    : path.join(__dirname, "../../index.html");
  win.loadFile(htmlPath);

  /* I5-fix: 外链只放行 http(s)（file://、ms-msdt: 等协议一律不开），页内顶层导航一律拦下转外开 */
  const ALLOWED_URL = /^https?:\/\//i;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (ALLOWED_URL.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    e.preventDefault();
    if (ALLOWED_URL.test(url)) shell.openExternal(url);
  });

  /* macOS 的应用菜单在系统顶栏，窗口级菜单栏只在 Windows/Linux 需要隐藏 */
  if (process.platform !== "darwin") win.setMenuBarVisibility(false);

  /* K8.5: 恢复立即执行——延迟 1s 会导致安装版任务栏初始图标闪烁，
     且如果用户快速操作可能与 IPC 切换产生时序冲突 */
  applyTaskbarIcon();
  installFantinSkill();

  nativeTheme.on("updated", () => {
    /* 系统主题变化：切换任务栏图标 + 通知页面（如果 autoTheme 开启） */
    applyTaskbarIcon();
    if (win && !win.isDestroyed()) win.webContents.executeJavaScript(
      `if(typeof state!=="undefined"&&state.autoTheme){state.dark=${nativeTheme.shouldUseDarkColors};applyTheme();requestRender();saveStateDebounced();}`
    );
  });

  win.on("closed", () => { win = null; });

  /* G11: 关闭确认 — 用应用内自定义 modal 替代系统对话框 */
  /* I5-fix: 兜底——渲染层 3 秒无响应（卡死/白屏）时改用主进程原生对话框，保证窗口永远关得掉 */
  win.on("close", function (e) {
    if (!isQuitting) {
      e.preventDefault();
      if (win.webContents && !win.webContents.isDestroyed()) win.webContents.send("show-quit-modal");
      if (quitFallbackTimer) clearTimeout(quitFallbackTimer);
      quitFallbackTimer = setTimeout(() => {
        quitFallbackTimer = null;
        if (isQuitting || !win || win.isDestroyed()) return;
        const choice = dialog.showMessageBoxSync(win, {
          type: "question",
          buttons: ["退出", "取消"],
          defaultId: 0,
          cancelId: 1,
          title: "织见",
          message: "页面没有响应，确定退出织见吗？",
        });
        if (choice === 0) { isQuitting = true; app.quit(); }
      }, 3000);
    }
  });
}

/* ===== IPC 处理器 ===== */

// 切换原生全屏
ipcMain.handle("toggle-fullscreen", () => {
  if (!win) return false;
  const isFs = win.isFullScreen();
  win.setFullScreen(!isFs);
  return !isFs;
});

// 获取全屏状态
// I5-fix: is-fullscreen 死通道删除

// 获取系统主题（亮色/暗色）——页面启动时读取初始值
ipcMain.handle("get-system-theme", () => {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
});

// 获取应用版本
ipcMain.handle("get-version", () => {
  return app.getVersion();
});

// Registry writes and shell notification are awaited; failures are returned to settings.
let fantinUpdateQueue = Promise.resolve();
ipcMain.handle("set-fantin-icon", (event, n) => {
  const job = fantinUpdateQueue.then(async () => {
    if (process.platform !== "win32") return { ok: false, error: "仅 Windows 支持文件图标切换" };
    n = Number(n);
    if (![1, 2, 3].includes(n)) return { ok: false, error: "无效图标" };
    const icoName = "fantin-" + n + ".ico";
    const srcDir = app.isPackaged ? path.join(process.resourcesPath, "icons") : path.join(__dirname, "icons");
    const dstDir = path.join(app.getPath("userData"), "icons");
    fs.mkdirSync(dstDir, { recursive: true });
    const dst = path.join(dstDir, icoName);
    fs.copyFileSync(path.join(srcDir, icoName), dst);
    await windowsIcons.runPowerShell(windowsIcons.fantinScript(dst, process.env.PORTABLE_EXECUTABLE_FILE || process.execPath));
    return { ok: true, path: dst };
  });
  fantinUpdateQueue = job.catch(() => {});
  return job.catch(e => ({ ok: false, error: e.message }));
});

// G8: 使用系统默认应用打开文件
ipcMain.handle("open-path", async (event, filePath) => {
  if (!filePath || typeof filePath !== "string") return false;
  try {
    await shell.openPath(filePath);
    return true;
  } catch (e) {
    console.error("open-path failed:", e);
    return false;
  }
});


// G8: blob to temp file then open with system default app
ipcMain.handle("open-blob", async (event, data) => {
  if (!data || !data.bytes) return false;
  var ext = path.extname(String(data.name || "file"));
  if (ext.indexOf("..") >= 0) ext = "";
  var tmp = app.getPath("temp");
  var fp = tmp + require("path").sep + "zhijian-" + Date.now() + ext;
  try {
    fs.writeFileSync(fp, Buffer.from(data.bytes));
    await shell.openPath(fp);
    return true;
  } catch (e) {
    console.error("open-blob failed:", e);
    return false;
  }
});

// G8: 文件关联 — 渲染器查询是否有待导入的 .fantin 文件
ipcMain.handle("get-open-file", () => {
  var p = pendingFantinPath;
  pendingFantinPath = null;
  return p;
});

// M1.4: 旧版 .doc（OLE2 二进制）文本抽取。
// 浏览器端只有 docx-preview（只认 ZIP/OOXML），.doc 必须自己解：
// OLE2 复合文档 → FIB → piece table → 正文，再叠 CHPX/PAPX 拿到粗体/字号/样式。
// 这段代码依赖 Node 的 Buffer，所以放在主进程跑，渲染层只拿结构化结果。
ipcMain.handle("doc-extract", async (event, data) => {
  if (!data || !data.bytes) return { ok: false, error: "没有收到文件内容" };
  try {
    const docx = require("./doc-extract");
    const buf = Buffer.from(data.bytes);
    const t0 = Date.now();
    const rich = docx.extractDocRich(buf);
    return {
      ok: true,
      ms: Date.now() - t0,
      bodySize: rich.bodySize,
      chars: rich.chars,
      blocks: rich.blocks.map((b) => ({
        text: b.text,
        heading: b.heading | 0,
        jc: b.jc | 0,
        indent: b.indent | 0,
        /* 表格行：cells 非空即视为表格的一行（按 0x07 单元格标记切分） */
        cells: b.isTableRow ? b.cells : null,
        runs: b.runs.map((r) => ({ text: r.text, b: r.bold ? 1 : 0, i: r.italic ? 1 : 0, s: r.size || 0 })),
      })),
    };
  } catch (e) {
    console.error("doc-extract failed:", e);
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// 选择文件夹对话框
// L5: select-directory 已删除——零调用方（原「织见数据存储位置」死设置的残留），
//     目录选择统一走 material-library-choose

// 检查是否在桌面环境
// I5-fix: is-desktop / get-user-data-path / get-documents-path / is-fullscreen / save-to-file 均为无调用方的死通道，已删除


/* G4: 路径安全校验——防止路径穿越 */
function safeJoin(root, sub) {
  const target = path.resolve(root, sub);
  const rootResolved = path.resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) {
    throw new Error("path traversal blocked");
  }
  return target;
}

/* ============================================================
   L5: 材料库——导入材料的本地落盘镜像
   浏览器数据库（IndexedDB）仍是在用的数据源；材料库是同一份内容
   在磁盘上的可查找副本，目录结构为 <根目录>/<项目名>/<文件名>。
   项目删除只解除引用，不删磁盘文件；只有用户显式清理时才删除。
============================================================ */
const MATERIAL_LIBRARY_DIRNAME = "织见材料库";
const MATERIAL_MAX_BYTES = 300 * 1024 * 1024;   /* 单个材料上限 300MB */
const MATERIAL_MAX_BATCH = 60;                  /* 单次读取文件数上限 */

function defaultMaterialLibrary() {
  return path.join(app.getPath("documents"), MATERIAL_LIBRARY_DIRNAME);
}
function materialRoot(input) {
  var root = typeof input === "string" && input.trim() ? input.trim() : defaultMaterialLibrary();
  return path.resolve(root);
}
/* Windows 文件名非法字符统一替换，避免写出用户打不开的文件 */
function safeSegment(name, fallback) {
  var s = String(name == null ? "" : name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/[\s.]+$/, "").trim();
  if (!s) s = fallback;
  if (s.length > 96) {
    var ext = path.extname(s).slice(0, 16);
    s = s.slice(0, 96 - ext.length) + ext;
  }
  return s;
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
/* 同名去重：同尺寸视为同一份材料直接复用；否则追加 (2)(3)… */
function resolveMaterialPath(dir, baseName, size) {
  var ext = path.extname(baseName);
  var stem = baseName.slice(0, baseName.length - ext.length);
  for (var n = 1; n <= 99; n++) {
    var candidate = path.join(dir, n === 1 ? baseName : stem + " (" + n + ")" + ext);
    var stat = null;
    try { stat = fs.statSync(candidate); } catch (e) { return { path: candidate, reused: false }; }
    if (stat && stat.isFile() && Number(size) > 0 && stat.size === Number(size)) return { path: candidate, reused: true };
  }
  return { path: path.join(dir, stem + " (" + Date.now() + ")" + ext), reused: false };
}
function materialTarget(root, projectName, fileName) {
  var dir = safeJoin(materialRoot(root), safeSegment(projectName, "未命名项目"));
  return { dir: dir, name: safeSegment(fileName, "材料") };
}
function walkMaterials(dir, depth, budget) {
  var out = { files: 0, bytes: 0, projects: [] };
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth >= 4) continue;
      var sub = walkMaterials(full, depth + 1, budget);
      out.files += sub.files; out.bytes += sub.bytes;
      if (depth === 0) out.projects.push({ name: entry.name, files: sub.files, bytes: sub.bytes });
    } else if (entry.isFile()) {
      var stat = null;
      try { stat = fs.statSync(full); } catch (e) { continue; }
      if (!stat) continue;
      out.files++; out.bytes += stat.size;
      budget.left--; if (budget.left <= 0) return out;
    }
  }
  return out;
}
function materialBytesToBuffer(bytes) {
  if (bytes == null) return null;
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Array.isArray(bytes)) return Buffer.from(bytes);
  return null;
}
function mimeOfName(name) {
  var ext = path.extname(String(name || "")).toLowerCase();
  var table = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp",
    ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv", ".json": "application/json",
    ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  return table[ext] || "application/octet-stream";
}

/* 材料库根目录默认值 */
ipcMain.handle("material-library-default", () => ({ ok: true, path: defaultMaterialLibrary() }));

/* 选择材料库根目录 */
ipcMain.handle("material-library-choose", async () => {
  if (!win) return { ok: false, error: "窗口不可用" };
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择材料库目录",
    defaultPath: defaultMaterialLibrary(),
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  return { ok: true, path: result.filePaths[0] };
});

/* 在资源管理器中打开材料库（可按项目名定位子目录） */
ipcMain.handle("material-library-open", async (event, data) => {
  try {
    var dir = materialRoot(data && data.root);
    if (data && data.projectName) dir = materialTarget(data.root, data.projectName, "").dir;
    ensureDir(dir);
    const error = await shell.openPath(dir);
    if (error) return { ok: false, error: error };
    return { ok: true, path: dir };
  } catch (e) { return { ok: false, error: e.message }; }
});

/* 定位单个材料文件（不存在则退化为打开目录） */
ipcMain.handle("material-library-reveal", async (event, data) => {
  try {
    if (!data || !data.fileName) return { ok: false, error: "缺少文件名" };
    var target = materialTarget(data.root, data.projectName, data.fileName);
    var full = safeJoin(target.dir, target.name);
    if (fs.existsSync(full)) { shell.showItemInFolder(full); return { ok: true, path: full }; }
    return await openMaterialDir(data.root, data.projectName);
  } catch (e) { return { ok: false, error: e.message }; }
});
async function openMaterialDir(root, projectName) {
  var dir = projectName ? materialTarget(root, projectName, "").dir : materialRoot(root);
  ensureDir(dir);
  const error = await shell.openPath(dir);
  return error ? { ok: false, error: error } : { ok: true, path: dir, fallback: true };
}

/* 写入一份材料（导入时同步落盘） */
ipcMain.handle("material-library-write", (event, data) => {
  try {
    if (!data || !data.fileName) return { ok: false, error: "缺少文件名" };
    var buffer = materialBytesToBuffer(data.bytes);
    if (!buffer) return { ok: false, error: "缺少文件内容" };
    var target = materialTarget(data.root, data.projectName, data.fileName);
    ensureDir(target.dir);
    var resolved = resolveMaterialPath(target.dir, target.name, buffer.length);
    if (!resolved.reused) fs.writeFileSync(resolved.path, buffer);
    return { ok: true, path: resolved.path, name: path.basename(resolved.path), reused: resolved.reused, bytes: buffer.length };
  } catch (e) { return { ok: false, error: e.message }; }
});

/* 材料库占用统计 */
ipcMain.handle("material-library-stats", (event, data) => {
  try {
    var root = materialRoot(data && data.root);
    const budget = { left: 20000 };
    var stats = fs.existsSync(root) ? walkMaterials(root, 0, budget) : { files: 0, bytes: 0, projects: [] };
    return { ok: true, root: root, exists: fs.existsSync(root), files: stats.files, bytes: stats.bytes, projects: stats.projects.slice(0, 200) };
  } catch (e) { return { ok: false, error: e.message }; }
});

/* 删除材料库中的单个文件（仅限材料库根目录内，且仅由用户显式触发） */
ipcMain.handle("material-library-delete", (event, data) => {
  try {
    if (!data || !data.fileName) return { ok: false, error: "缺少文件名" };
    var target = materialTarget(data.root, data.projectName, data.fileName);
    var full = safeJoin(target.dir, target.name);
    if (!fs.existsSync(full)) return { ok: false, error: "文件不存在" };
    fs.unlinkSync(full);
    return { ok: true, path: full };
  } catch (e) { return { ok: false, error: e.message }; }
});

/* 多选文件对话框——给「从磁盘导入材料」用 */
ipcMain.handle("select-material-files", async () => {
  if (!win) return { ok: false, error: "窗口不可用" };
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    title: "选择要导入的材料",
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true, paths: [] };
  const paths = [];
  for (const filePath of result.filePaths.slice(0, MATERIAL_MAX_BATCH * 4)) {
    var stat = null;
    try { stat = fs.statSync(filePath); } catch (e) { continue; }
    if (!stat || !stat.isFile()) continue;
    paths.push({ path: filePath, name: path.basename(filePath), size: stat.size, mime: mimeOfName(filePath) });
  }
  return { ok: true, paths };
});

/* 按路径读取文件内容——AI/渲染层「给路径即上传」的唯一入口 */
ipcMain.handle("read-material-files", (event, data) => {
  try {
    var list = data && Array.isArray(data.paths) ? data.paths : [];
    if (!list.length) return { ok: false, error: "未提供文件路径" };
    if (list.length > MATERIAL_MAX_BATCH) return { ok: false, error: "单次最多读取 " + MATERIAL_MAX_BATCH + " 个文件" };
    var files = [], errors = [];
    for (var i = 0; i < list.length; i++) {
      var filePath = typeof list[i] === "string" ? list[i] : (list[i] && list[i].path);
      if (!filePath || typeof filePath !== "string") { errors.push({ path: String(filePath), error: "路径无效" }); continue; }
      var resolved = path.resolve(filePath);
      try {
        var stat = fs.statSync(resolved);
        if (!stat.isFile()) throw new Error("不是文件");
        if (stat.size > MATERIAL_MAX_BYTES) throw new Error("超过单个材料上限 " + Math.round(MATERIAL_MAX_BYTES / 1024 / 1024) + "MB");
        var buffer = fs.readFileSync(resolved);
        files.push({ path: resolved, name: path.basename(resolved), size: stat.size, mime: mimeOfName(resolved), bytes: new Uint8Array(buffer) });
      } catch (e) { errors.push({ path: resolved, error: e.message }); }
    }
    return { ok: true, files: files, errors: errors };
  } catch (e) { return { ok: false, error: e.message }; }
});

/* 材料卡「在文件夹中显示」——优先用本地落盘文件，其次临时目录 */
ipcMain.handle("reveal-blob", async (event, data) => {
  try {
    if (!data) return { ok: false, error: "缺少参数" };
    if (data.fileName && data.projectName !== undefined) {
      var probe = materialTarget(data.root, data.projectName, data.fileName);
      var existing = safeJoin(probe.dir, probe.name);
      if (fs.existsSync(existing)) { shell.showItemInFolder(existing); return { ok: true, path: existing }; }
    }
    if (!data.bytes) return { ok: false, error: "材料未落盘且无内容" };
    var buffer = materialBytesToBuffer(data.bytes);
    if (!buffer) return { ok: false, error: "材料内容无效" };
    var ext = path.extname(String(data.fileName || ""));
    var tmp = path.join(app.getPath("temp"), "织见材料-" + Date.now() + ext);
    fs.writeFileSync(tmp, buffer);
    shell.showItemInFolder(tmp);
    return { ok: true, path: tmp, temporary: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

require("./package-ipc").install({ipcMain,dialog,app,getWindow:()=>win});
require("./package-stream").install({ipcMain,dialog,app,getWindow:()=>win});

/* ===== 自动保存到文件系统 ===== */
// I5-fix: save-to-file 死通道删除（持久化实际走 localStorage/IndexedDB + .fantin 导出）

/* G11: 设置任务栏图标 (preset=1/2/3, style="flat"|"clean") */
/* I5-fix: 参数白名单校验——异常值不再拼进图标文件名 */
/* I7-fix: 返回 applyTaskbarIcon 结果供渲染层检查 */
ipcMain.handle("set-taskbar-icon", (event, data) => {
  if (!data || typeof data !== "object") return { ok: false, error: "invalid data" };
  const p = parseInt(data.preset);
  if (p >= 1 && p <= 3) taskbarPreset = p;
  if (data.style === "flat" || data.style === "clean") taskbarStyle = data.style;
  return applyTaskbarIcon();
});

/* G11: 用户确认退出 */
ipcMain.handle("confirm-quit", () => {
  isQuitting = true;
  if (quitFallbackTimer) { clearTimeout(quitFallbackTimer); quitFallbackTimer = null; }
  app.quit();
});

/* I5-fix: 渲染层取消退出时清掉兜底定时器 */
ipcMain.handle("quit-modal-ready",()=>{if(quitFallbackTimer){clearTimeout(quitFallbackTimer);quitFallbackTimer=null;}});

ipcMain.handle("cancel-quit", () => {
  if (quitFallbackTimer) { clearTimeout(quitFallbackTimer); quitFallbackTimer = null; }
});

ipcMain.handle("set-titlebar-overlay", (e, opts) => {
  if (win && !win.isDestroyed()) win.setTitleBarOverlay(opts);
});

/* L4: 自定义窗口控制按钮 IPC */
ipcMain.handle("win-minimize", () => { if (win && !win.isDestroyed()) win.minimize(); });
ipcMain.handle("win-maximize-toggle", () => { if (win && !win.isDestroyed()) { if (win.isMaximized()) win.unmaximize(); else win.maximize(); } });
ipcMain.handle("win-close", () => { if (win && !win.isDestroyed()) win.close(); });

/* I5-fix: 任何 app.quit() 路径（含 macOS Cmd+Q）都先置退出标志，避免被 close 拦截 */
app.on("before-quit", e => { if(!isQuitting&&win&&!win.isDestroyed()){e.preventDefault();win.close();} });

/* G8: 单实例锁 — 已运行时双击 .fantin 发给已有窗口 */
var gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv, workingDir) => {
    var fantinPath = extractFantinFromArgv(argv);
    if (fantinPath) {
      pendingFantinPath = fantinPath;
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send("open-fantin-file");
      }
    } else if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    /* G8: 检查 argv 中是否有 .fantin 文件 */
    pendingFantinPath = extractFantinFromArgv(process.argv);
    buildAppMenu();   /* macOS：设置应用菜单（Windows 下为空操作） */
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
