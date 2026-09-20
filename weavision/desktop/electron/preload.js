const { contextBridge, ipcRenderer } = require("electron");

/* 暴露桌面 API 给页面——页面通过 window.electronAPI 访问 */
contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
  packageBegin: data => ipcRenderer.invoke("l1-package-begin",data),
  packageChunk: data => ipcRenderer.invoke("l1-package-chunk",data),
  packageFinish: data => ipcRenderer.invoke("l1-package-finish",data),
  packageCancel: data => ipcRenderer.invoke("l1-package-cancel",data),
  getStartupTimings: () => ipcRenderer.invoke("get-startup-timings"),
  quitModalReady: () => ipcRenderer.invoke("quit-modal-ready"),
  cancelPackage: () => ipcRenderer.invoke("cancel-package"),
  onPackageProgress: cb => { const listener=(_event,data)=>cb(data);ipcRenderer.on("package-progress",listener);return ()=>ipcRenderer.removeListener("package-progress",listener); },

  /* 原生全屏（不同于浏览器 Fullscreen API，用窗口级全屏） */
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),

  /* 应用信息 */
  getVersion: () => ipcRenderer.invoke("get-version"),

  /* 系统主题（亮/暗）——autoTheme 启动时读取初始值 */
  getSystemTheme: () => ipcRenderer.invoke("get-system-theme"),

  /* G4: 导出/导入——4 个入口（.fantin 文件 × 2 + 文件夹 × 2） */
  exportFantin: (data) => ipcRenderer.invoke("export-fantin", data),
  exportFolder: (data) => ipcRenderer.invoke("export-folder", data),
  importFantin: (presetPath) => ipcRenderer.invoke("import-fantin", presetPath),
  importFolder: () => ipcRenderer.invoke("import-folder"),

  /* 文件/目录对话框
     L5: selectDirectory 为零调用方死导出，已由材料库目录选择取代。
     M1-fix: 这里原先叫 chooseMaterialLibrary，前端 l1-material.js 调的却是
     materialLibraryChoose —— 名字对不上，取到的是 undefined，调用即抛
     TypeError；而调用点是个 async 箭头函数，异常变成未处理的 Promise 拒绝，
     于是"点击更改目录完全没反应"（不弹窗、不报错、无 toast）。
     统一到 materialLibrary* 家族命名，与下面六个别名保持一致。 */
  materialLibraryChoose: () => ipcRenderer.invoke("material-library-choose"),

  /* L5: 材料库——导入材料的本地落盘镜像（<根目录>/<项目名>/<文件名>） */
  materialLibraryDefault: () => ipcRenderer.invoke("material-library-default"),
  materialLibraryOpen: (data) => ipcRenderer.invoke("material-library-open", data),
  materialLibraryReveal: (data) => ipcRenderer.invoke("material-library-reveal", data),
  materialLibraryWrite: (data) => ipcRenderer.invoke("material-library-write", data),
  materialLibraryStats: (data) => ipcRenderer.invoke("material-library-stats", data),
  materialLibraryDelete: (data) => ipcRenderer.invoke("material-library-delete", data),

  /* L5: 给路径即导入——多选对话框 + 按路径读取内容 */
  selectMaterialFiles: () => ipcRenderer.invoke("select-material-files"),
  readMaterialFiles: (paths) => ipcRenderer.invoke("read-material-files", { paths }),

  /* L5: 材料卡「在文件夹中显示」 */
  revealBlob: (data) => ipcRenderer.invoke("reveal-blob", data),

  /* 系统路径
     I5-fix: getUserDataPath / getDocumentsPath 为无调用方的死导出，已删除 */

  /* 打开文件/路径 */
  openPath: (p) => ipcRenderer.invoke("open-path", p),

  /* G8: blob 写临时文件后用系统默认应用打开 */
  openBlob: (data) => ipcRenderer.invoke("open-blob", data),
  /* M1.4: 旧版 .doc 文本+格式抽取（主进程跑，渲染层只拿 blocks） */
  docExtract: (data) => ipcRenderer.invoke("doc-extract", data),

  /* G8: 文件关联 — 查询待导入的 .fantin 路径 */
  getOpenFile: () => ipcRenderer.invoke("get-open-file"),

  /* G8: 文件关联 — 监听 second-instance 发来的打开事件 */
  onOpenFantinFile: (cb) => ipcRenderer.on("open-fantin-file", cb),

  /* K9: 托盘菜单「设置」→ 渲染层打开设置面板 */
  onTrayOpenSettings: (cb) => ipcRenderer.on("tray-open-settings", cb),

  /* G11: 设置任务栏图标风格 (preset=1/2/3, style="flat"|"clean") */
  setTaskbarIcon: (data) => ipcRenderer.invoke("set-taskbar-icon", data),

  /* H4: 设置 .fantin 文件图标——运行时写注册表 HKCU\...\.fantin\DefaultIcon + SHChangeNotify 刷新缓存（像 WPS 那样实时改，不用重装）。n=1/2/3 */
  setFantinIcon: (n) => ipcRenderer.invoke("set-fantin-icon", n),

  /* G11: 退出确认 — 主进程通知渲染进程弹 modal */
  onShowQuitModal: (cb) => ipcRenderer.on("show-quit-modal", cb),
  confirmQuit: () => ipcRenderer.invoke("confirm-quit"),
  /* I5-fix: 用户取消退出时通知主进程清掉兜底定时器 */
  cancelQuit: () => ipcRenderer.invoke("cancel-quit"),
  setTitleBarOverlay: (opts) => ipcRenderer.invoke("set-titlebar-overlay", opts),
  minimize: () => ipcRenderer.invoke("win-minimize"),
  maximizeToggle: () => ipcRenderer.invoke("win-maximize-toggle"),
  closeWindow: () => ipcRenderer.invoke("win-close"),
});

/* 页面加载后注入桌面标记 */
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.desktop = "electron";
});
