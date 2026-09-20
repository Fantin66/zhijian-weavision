const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const resources = path.resolve(__dirname, '../发行版/L1/win-unpacked/resources');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'zhijian-icon-settings-')));
let fail = false;
app.whenReady().then(async () => {
  let win;
  try {
    for (const [name, value] of Object.entries({ 'get-version': '0.11.0', 'get-system-theme': false,
      'get-open-file': null, 'quit-modal-ready': true })) ipcMain.handle(name, () => value);
    ipcMain.handle('set-taskbar-icon', () => fail ? { ok: false, error: 'test failure' } : { ok: true });
    ipcMain.handle('set-fantin-icon', () => fail ? { ok: false, error: 'test failure' } : { ok: true });
    win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(resources, 'app.asar/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await win.loadFile(path.join(resources, 'index.html'));
    const run = code => win.webContents.executeJavaScript(code);
    await run(`(async()=>{for(let i=0;i<100&&typeof showSettings!=='function';i++)await new Promise(r=>setTimeout(r,50));
      _settingsCat='appearance';showSettings();})()`);
    for (const failing of [false, true]) {
      fail = failing;
      const result = await run(`(async()=>{
        localStorage.setItem('zhijian-icon-style','clean');state.fantinIcon=2;showSettings();
        await document.querySelector('#iconStyleChoices').children[0].onclick();
        const style=localStorage.getItem('zhijian-icon-style');
        await document.querySelector('.fantinIconBtn[data-n="3"]').onclick();
        return {style,fantin:state.fantinIcon};
      })()`);
      assert.deepEqual(result, failing ? { style: 'clean', fantin: 2 } : { style: 'flat', fantin: 3 });
    }
    const asar = require('../desktop/electron/node_modules/@electron/asar');
    const archive = path.join(resources, 'app.asar');
    for (const name of ['main.js', 'windows-icons.js', 'preload.js', 'package-stream.js', 'package-stream-worker.js', 'skill-install.js']) {
      assert.equal(asar.extractFile(archive, name).toString(), fs.readFileSync(path.join(__dirname, '../desktop/electron', name), 'utf8'));
    }
    assert.equal(fs.readFileSync(path.join(resources, 'src/js/app.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../src/js/app.js'), 'utf8'));
    const pkg = JSON.parse(asar.extractFile(archive, 'package.json'));
    assert.equal(pkg.version, '0.11.0');
    console.log('PASS: packaged preload/IPC; settings success and failure behavior; packaged main, helper and renderer match repaired source.');
  } catch (e) { console.error(e.stack); process.exitCode = 1; }
  finally { if (win) win.destroy(); app.exit(process.exitCode || 0); }
});
