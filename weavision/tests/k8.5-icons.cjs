/* Run with Electron. Only temporary shortcuts and an isolated HKCU test key are modified. */
const { app, shell, nativeImage, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const icons = require('../desktop/electron/windows-icons');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhijian-icons-'));
app.setPath('userData', path.join(root, 'profile'));
app.whenReady().then(async () => {
  let win;
  try {
    const exe = path.join(root, "中文 空格'目录", '织见.exe');
    const roots = ['个人桌面', '公共桌面', '开始菜单/子目录', 'User Pinned/TaskBar'].map(d => path.join(root, d));
    for (const dir of roots) {
      fs.mkdirSync(dir, { recursive: true });
      assert(shell.writeShortcutLink(path.join(dir, '已改名.lnk'), { target: exe, args: '--keep-me' }));
      assert(shell.writeShortcutLink(path.join(dir, '织见-其他安装.lnk'), { target: process.execPath }));
    }
    for (const name of ['clean-1', 'clean-2', 'clean-3', 'flat-1-light', 'flat-1-dark', 'flat-2-light', 'flat-2-dark', 'flat-3-light', 'flat-3-dark']) {
      const img = nativeImage.createFromPath(path.join(__dirname, '../desktop/electron/icons', name + '.png'));
      assert(!img.isEmpty());
      const ico = icons.toIco(img);
      assert.equal(ico.readUInt32LE(18), 22);
      assert.deepEqual(nativeImage.createFromBuffer(ico.subarray(22)).getSize(), { width: 256, height: 256 });
      const icoPath = path.join(root, name + '.ico');
      fs.writeFileSync(icoPath, ico);
      const result = icons.updateShortcuts(shell, roots, exe, icoPath);
      assert.equal(result.updated, 4);
      assert.deepEqual(result.errors, []);
      for (const dir of roots) {
        const link = shell.readShortcutLink(path.join(dir, '已改名.lnk'));
        assert.equal(link.icon, icoPath);
        assert.equal(link.appUserModelId, icons.APP_ID);
        assert.equal(link.args, '--keep-me');
        assert.notEqual(shell.readShortcutLink(path.join(dir, '织见-其他安装.lnk')).icon, icoPath);
      }
      if (!win) win = new BrowserWindow({ show: false });
      win.setIcon(img);
      win.setAppDetails({ appId: icons.APP_ID, appIconPath: icoPath, appIconIndex: 0,
        relaunchCommand: '"' + exe + '"', relaunchDisplayName: '织见' });
    }
    const blocked = icons.updateShortcuts({ readShortcutLink: shell.readShortcutLink,
      writeShortcutLink: () => false }, roots, exe, 'test.ico');
    assert.equal(blocked.errors.length, 4);

    // Remap both the merged Classes hive and writes into a unique temporary subtree.
    const key = 'Software\\WeavisionIconTest-' + process.pid;
    const classes = key + '\\Classes';
    const choice = key + '\\UserChoice';
    function isolated(script) {
      return script.replace('[Microsoft.Win32.Registry]::ClassesRoot',
        `[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('${classes}')`)
        .replaceAll('Software\\Classes\\', classes + '\\')
        .replace('Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.fantin\\UserChoice', choice)
        .replace(icons.REFRESH, '');
    }
    let script = `$cu = [Microsoft.Win32.Registry]::CurrentUser\ntry {\n`;
    script += `$k=$cu.CreateSubKey('${classes}\\.fantin'); $k.SetValue('', '织见画板'); $k.Close()\n`;
    for (const n of [1, 3, 2]) {
      const icoPath = path.join(root, "中文 空格'目录", 'fantin-' + n + '.ico');
      script += isolated(icons.fantinScript(icoPath, exe));
      script += `\n$k=$cu.OpenSubKey('${classes}\\织见画板\\DefaultIcon'); if ($k.GetValue('') -ne ('"' + $data.iconPath + '",0')) { throw 'Chinese ProgID icon mismatch' }; $k.Close()\n`;
    }
    script += `$k=$cu.CreateSubKey('${choice}'); $k.SetValue('ProgId', 'OtherApp'); $k.Close()\n`;
    script += '$rejected=$false\ntry {\n' + isolated(icons.fantinScript('unused.ico', exe)) +
      "\n} catch { $rejected=$true }; if (!$rejected) { throw 'Foreign association was modified' }\n";
    script += `} finally { $cu.DeleteSubKeyTree('${key}', $false) }`;
    await icons.runPowerShell(script);
    await assert.rejects(icons.runPowerShell("throw 'expected failure'"));
    console.log('PASS: 9 icon variants; 4 shortcut locations; Chinese/renamed links; other-installation isolation; permission errors; taskbar properties; Unicode registry paths; 3 Fantin choices; foreign association protection; process failure propagation.');
  } catch (e) { console.error(e.stack); process.exitCode = 1; }
  finally {
    if (win) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
