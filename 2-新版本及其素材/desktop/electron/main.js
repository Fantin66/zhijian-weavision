const { app, BrowserWindow, shell, nativeTheme, ipcMain, dialog, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const { execFile } = require("child_process");

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
/* I7-fix: 安装版从快捷方式启动，Windows 任务栏用快捷方式图标而非窗口图标。
   切换任务栏图标时同步把裁剪后的图标包成 ICO 更新到桌面/开始菜单的 .lnk 快捷方式。
   ICO 直接包裹 PNG 原始数据（22 字节 ICO 头 + PNG 字节），完美保留 alpha 透明通道。
   传入的是 nativeImage（已裁剪透明边距 + resize），保证快捷方式图标和窗口图标大小一致。
   每个预设/风格用独立 ICO 文件名，Windows 看到新路径才刷新缓存。 */
function updateShortcutIcons(nativeImg, baseName) {
  if (process.platform !== "win32") return;
  try {
    /* nativeImage → PNG buffer（已裁剪透明边距，内容填满）→ ICO */
    var pngData = nativeImg.toPNG();
    var header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);  /* reserved */
    header.writeUInt16LE(1, 2);  /* type = icon */
    header.writeUInt16LE(1, 4);  /* count = 1 */
    var dir = Buffer.alloc(16);
    dir.writeUInt8(0, 0);   /* width (0=256) */
    dir.writeUInt8(0, 1);   /* height (0=256) */
    dir.writeUInt8(0, 2);   /* color count */
    dir.writeUInt8(0, 3);   /* reserved */
    dir.writeUInt16LE(1, 4);     /* planes */
    dir.writeUInt16LE(32, 6);    /* bit count */
    dir.writeUInt32LE(pngData.length, 8);  /* bytes in resource */
    dir.writeUInt32LE(22, 12);             /* image offset = 6+16 */
    var ico = Buffer.concat([header, dir, pngData]);
    /* 用预设名+风格名做文件名，切换时 Windows 看到新路径才刷新 */
    var icoDir = path.join(app.getPath("userData"), "icons");
    if (!fs.existsSync(icoDir)) fs.mkdirSync(icoDir, { recursive: true });
    var icoPath = path.join(icoDir, baseName + ".ico");
    fs.writeFileSync(icoPath, ico);
    /* PowerShell 只负责找快捷方式 + 改 IconLocation + 刷新缓存 */
    var ps = "param([string]$IcoPath)\r\n" +
      "$shell = New-Object -ComObject WScript.Shell\r\n" +
      "$desktop = [Environment]::GetFolderPath('Desktop')\r\n" +
      "$startMenu = [Environment]::GetFolderPath('StartMenu')\r\n" +
      "Get-ChildItem -Path $desktop -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*zhijian*' -or $_.Name -like '*织见*' } | ForEach-Object {\r\n" +
      "  $sc = $shell.CreateShortcut($_.FullName)\r\n" +
      "  $sc.IconLocation = $IcoPath + ',0'\r\n" +
      "  $sc.Save()\r\n" +
      "}\r\n" +
      "Get-ChildItem -Path $startMenu -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*zhijian*' -or $_.Name -like '*织见*' } | ForEach-Object {\r\n" +
      "  $sc = $shell.CreateShortcut($_.FullName)\r\n" +
      "  $sc.IconLocation = $IcoPath + ',0'\r\n" +
      "  $sc.Save()\r\n" +
      "}\r\n" +
      "$sig='[System.Runtime.InteropServices.DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr d1, IntPtr d2);'\r\n" +
      "try { Add-Type -Namespace ZJN -Name S -MemberDefinition $sig } catch {}\r\n" +
      "[ZJN.S]::SHChangeNotify(134217728, 0, [IntPtr]::Zero, [IntPtr]::Zero)\r\n";
    var tmp = safeJoin(app.getPath("temp"), "zhijian-shortcut-icon-" + Date.now() + ".ps1");
    fs.writeFileSync(tmp, ps, "utf-8");
    execFile(PS_EXE, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tmp, "-IcoPath", icoPath], { shell: false, windowsHide: true }, function () {
      fs.rmSync(tmp, { force: true });
    });
  } catch (e) {
    console.error("shortcut icon update failed:", e.message);
  }
}
function applyTaskbarIcon() {
  if (!win) return { ok: false, error: "no window" };
  const isDark = nativeTheme.shouldUseDarkColors;
  /* I5-fix: 打包后 __dirname 在 app.asar 内没有 icons，必须读 extraResources 的 resourcesPath/icons（与 set-fantin-icon 同一分支） */
  const iconsDir = app.isPackaged ? path.join(process.resourcesPath, "icons") : path.join(__dirname, "icons");
  let iconPath;
  if (taskbarStyle === "clean") {
    iconPath = path.join(iconsDir, "clean-" + taskbarPreset + ".png");
  } else {
    iconPath = path.join(iconsDir, "flat-" + taskbarPreset + "-" + (isDark ? "dark" : "light") + ".png");
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
  /* I7-fix: 同步更新快捷方式图标——用裁剪后的图像（和窗口图标一致），不是原始 PNG */
  updateShortcutIcons(finalImg, path.basename(iconPath, ".png"));
  /* I7-fix: Windows 任务栏图标缓存——toggle skipTaskbar 强制任务栏按钮销毁重建，新图标才生效 */
  if (process.platform === "win32" && !win.isDestroyed()) {
    var wasMinimized = win.isMinimized();
    win.setSkipTaskbar(true);
    win.setSkipTaskbar(false);
    if (wasMinimized) win.minimize();
  }
  return { ok: true, path: iconPath };
}

/* K5: 自动安装 zhijian-ai skill 到用户 ~/.agents/skills/ 目录。
   skill 覆盖两个方向：AI 操作画布 + AI 读取 .fantin 生成报告。 */
function installFantinSkill() {
  try {
    var skillSrc = path.join(process.resourcesPath, ".agents", "skills", "zhijian-ai");
    if (!fs.existsSync(skillSrc)) return;
    var homeDir = app.getPath("home");
    var skillDst = path.join(homeDir, ".agents", "skills", "zhijian-ai");
    /* 已安装则跳过（用户可能手动修改过） */
    if (fs.existsSync(path.join(skillDst, "SKILL.md"))) return;
    /* 递归复制 */
    function copyDir(src, dst) {
      if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
      for (var entry of fs.readdirSync(src, { withFileTypes: true })) {
        var sp = path.join(src, entry.name);
        var dp = path.join(dst, entry.name);
        if (entry.isDirectory()) copyDir(sp, dp);
        else fs.copyFileSync(sp, dp);
      }
    }
    copyDir(skillSrc, skillDst);
    console.log("fantin-report skill installed to", skillDst);
  } catch (e) {
    console.error("skill install failed:", e.message);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "织见 · 思维关系板",
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false, /* H2 任务10: 代码统一用 <iframe> 不用 <webview>，关闭以省一个潜在独立进程路径 */
    },
  });

  /* G9: 打包后用 extraResources 路径，开发时用相对路径 */
  const htmlPath = app.isPackaged
    ? path.join(process.resourcesPath, "index.html")
    : path.join(__dirname, "../../织见-思维关系板-K6.html");
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

  win.setMenuBarVisibility(false);

  /* G11: 任务栏图标按风格+预设+系统主题设置 */
  applyTaskbarIcon();

  /* K5: 自动安装 fantin-report skill 到用户目录 */
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

// H4: 设置 .fantin 文件图标——运行时写注册表 HKCU\...\.fantin\DefaultIcon + SHChangeNotify 刷新缓存（像 WPS 那样实时改，不用重装）。n=1/2/3
// 安全：icoName 取白名单 + safeJoin 边界校验（防穿越）；reg/powershell 用 execFile 参数数组 shell=false（防注入）；刷新脚本为常量无动态数据。
const FANTIN_ICONS = ["fantin-1.ico", "fantin-2.ico", "fantin-3.ico"];
/* I5-fix: 可执行程序一律用代码内字面量绝对路径，不读 SystemRoot 等环境变量——
   防止环境变量被篡改后 execFile 启动攻击者放置的同名假程序。
   （极端的非 C:\Windows 安装会导致图标刷新功能静默降级，不影响应用其它功能） */
const REG_EXE = "C:\\Windows\\System32\\reg.exe";
const PS_EXE = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
ipcMain.handle("set-fantin-icon", async (event, n) => {
  try {
    n = parseInt(n) || 2;
    if (n < 1 || n > 3) n = 2;
    const icoName = FANTIN_ICONS[n - 1];
    const srcDir = app.isPackaged ? path.join(process.resourcesPath, "icons") : path.join(__dirname, "icons");
    const src = safeJoin(srcDir, icoName);
    if (!fs.existsSync(src)) return { ok: false, error: "icon not found: " + src };
    /* 拷到 userData/icons（ASCII 路径，注册表值不含中文，Windows 读图标路径才稳） */
    const dstDir = path.join(app.getPath("userData"), "icons");
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
    const dst = safeJoin(dstDir, icoName);
    fs.copyFileSync(src, dst);
    /* 写注册表——reg.exe + execFile 参数数组，dst 作参数（不拼命令） */
    await new Promise((res) => {
      execFile(REG_EXE, ["add", "HKCU\\Software\\Classes\\.fantin\\DefaultIcon", "/ve", "/d", dst, "/f"], { shell: false, windowsHide: true }, () => res());
    });
    /* I6-fix: 同时写 ProgID 的 DefaultIcon——NSIS 安装器把图标设在 ProgID 层，
       只写扩展层 DefaultIcon 在部分 Windows 构建上不生效（Windows 图标解析顺序有缓存） */
    await new Promise((res) => {
      execFile(REG_EXE, ["query", "HKCU\\Software\\Classes\\.fantin", "/ve"], { shell: false, windowsHide: true, maxBuffer: 4096 }, (err, stdout) => {
        if (!err && stdout) {
          /* 解析 reg query 输出找 ProgID（Default 值） */
          var m = stdout.match(/REG_SZ\s+(.+?)\s*$/m);
          if (m && m[1] && m[1].trim()) {
            var progId = m[1].trim();
            /* 写 ProgID 的 DefaultIcon（best-effort，失败不影响主流程） */
            execFile(REG_EXE, ["add", "HKCU\\Software\\Classes\\" + progId + "\\DefaultIcon", "/ve", "/d", dst, "/f"], { shell: false, windowsHide: true }, () => {});
          }
        }
        res();
      });
    });
    /* 刷新图标缓存——常量 PS 脚本（无动态数据）走临时 .ps1 + execFile -File */
    const ps = "$sig='[System.Runtime.InteropServices.DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr d1, IntPtr d2);'\r\ntry { Add-Type -Namespace ZJN -Name S -MemberDefinition $sig } catch {}\r\n[ZJN.S]::SHChangeNotify(134217728, 0, [IntPtr]::Zero, [IntPtr]::Zero)\r\n";
    const tmp = safeJoin(app.getPath("temp"), "zhijian-fantin-icon-" + Date.now() + ".ps1");
    fs.writeFileSync(tmp, ps, "utf-8");
    await new Promise((res) => {
      execFile(PS_EXE, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tmp], { shell: false, windowsHide: true }, () => res());
    });
    fs.rmSync(tmp, { force: true });
    return { ok: true, path: dst };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

// 选择文件夹对话框
ipcMain.handle("select-directory", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择织见数据存储位置",
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

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

require("./package-ipc").install({ipcMain,dialog,app,getWindow:()=>win});

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
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
