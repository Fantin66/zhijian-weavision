/* CI 用：在 macOS runner 上通过 CDP 控制已启动的织见，关掉首启许可弹窗并截图。
   依赖 Node 18+ 的全局 fetch / WebSocket（Node 22 已内置）。
   用法：node ci-mac-shot.cjs <debugPort> <outDir>
   产出：main.png（主界面）、immersive.png（沉浸模式）、focus.png（聚焦，若成功） */
const fs = require("fs");
const path = require("path");

const PORT = process.argv[2] || "9222";
const OUT = process.argv[3] || "/tmp/mac-shots";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickPage() {
  /* app 刚起来时调试端口可能还没就绪，重试几次 */
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) { /* 未就绪，继续等 */ }
    await sleep(1000);
  }
  throw new Error("CDP 端口未就绪：" + PORT);
}

(async () => {
  const page = await pickPage();
  console.log("CDP page =", page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  await send("Runtime.enable");
  await send("Page.enable");

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    return r && r.result ? r.result.value : undefined;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const f = path.join(OUT, name);
    fs.writeFileSync(f, Buffer.from(r.data, "base64"));
    console.log("shot ->", f, fs.statSync(f).size + "B");
  };

  /* 1. 等 splash 结束 + 关掉首启许可弹窗（与 tests/k8.4-welcome.cjs 同一套选择器） */
  await sleep(3000);
  const clicked = await evalJs(`(async()=>{
    for(let i=0;i<100;i++){
      if(document.getElementById('splashScreen')){ await new Promise(r=>setTimeout(r,50)); continue; }
      const b=document.querySelector('#licenseModal button');
      if(b){ b.click(); return 'clicked'; }
      await new Promise(r=>setTimeout(r,50));
    }
    return 'no-modal';
  })()`);
  console.log("license modal:", clicked);
  await sleep(1500);
  await shot("main.png");

  /* 2. 沉浸模式（隐藏顶栏/侧栏）—— 顺带验证 Mac 上沉浸态的渲染 */
  const imm = await evalJs(`(()=>{ if(typeof toggleImmersive==='function'){toggleImmersive();return 'ok';} return 'no-fn'; })()`);
  console.log("immersive:", imm);
  await sleep(1200);
  await shot("immersive.png");
  await evalJs(`(()=>{ if(typeof toggleImmersive==='function')toggleImmersive(); })()`);
  await sleep(800);

  /* 3. 聚焦：选中第一个元素后按 F，验证聚焦态与 HUD。
     注意 state.selected 是 **id 字符串**（见 interaction.js: state.selected=hit.id），不是数组 */
  const foc = await evalJs(`(async()=>{
    try{
      const it=(state.items||[]).find(i=>i.type==='mindNode')||(state.items||[])[0];
      if(!it) return 'no-item';
      state.selected=it.id;
      state.multiSel=[];
      if(typeof render==='function')render();
      if(typeof toggleFocus==='function')toggleFocus();
      return 'focused:'+it.id;
    }catch(e){ return 'err:'+e.message; }
  })()`);
  console.log("focus:", foc);
  await sleep(1800);
  await shot("focus.png");

  /* 3b. 超聚焦：聚焦态下左上角 HUD 里的「进入超聚焦」按钮 */
  const sup = await evalJs(`(async()=>{
    try{
      const b=document.querySelector('#focusHud .focus-super-btn')||document.querySelector('.focus-super-btn');
      if(!b) return 'no-super-btn';
      b.click();
      return 'clicked';
    }catch(e){ return 'err:'+e.message; }
  })()`);
  console.log("superfocus:", sup);
  await sleep(2200);
  await shot("superfocus.png");

  /* 4. 顺手报一下窗口与顶栏尺寸，便于核对红绿灯留白是否合适 */
  /* 4. 顶栏布局体检：是否溢出（有子元素被挤出可视区）、各子元素右边界、mac 留白是否够 */
  const metrics = await evalJs(`(()=>{
    const tb=document.getElementById('topbar');
    const kids=tb?[...tb.children].map(c=>({tag:(c.id||c.className||c.tagName), right:Math.round(c.getBoundingClientRect().right), w:Math.round(c.getBoundingClientRect().width), display:getComputedStyle(c).display})):null;
    const vis=kids?kids.filter(k=>k.display!=='none'):null;
    return JSON.stringify({
      dpr:window.devicePixelRatio, winW:window.innerWidth, winH:window.innerHeight,
      topbarH: tb?Math.round(tb.getBoundingClientRect().height):null,
      padLeft: tb?getComputedStyle(tb).paddingLeft:null,
      padRight: tb?getComputedStyle(tb).paddingRight:null,
      topbarScrollW: tb?tb.scrollWidth:null,
      topbarClientW: tb?tb.clientWidth:null,
      topbarOverflow: tb?tb.scrollWidth > tb.clientWidth+1:null,
      lastChildRight: vis&&vis.length?Math.max(...vis.map(k=>k.right)):null,
      childCount: kids?kids.length:null,
      hiddenChildren: kids?kids.filter(k=>k.display==='none').map(k=>k.tag):null,
      controls: document.querySelector('.win-controls')?getComputedStyle(document.querySelector('.win-controls')).display:null,
      platform: document.documentElement.dataset.platform
    });
  })()`);
  console.log("metrics =", metrics);

  ws.close();
  console.log("DONE");
})().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
