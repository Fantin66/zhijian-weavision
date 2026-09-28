const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const APP_ID = 'com.weavision.zhijian';
const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

// EncodedCommand preserves Chinese paths and ProgIDs in Windows PowerShell 5.1.
function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(PS_EXE, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop'\n" + script, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });
}
const REFRESH = `
Add-Type -Namespace WeavisionIcons -Name Shell -MemberDefinition '[System.Runtime.InteropServices.DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, int f, System.IntPtr a, System.IntPtr b);'
[WeavisionIcons.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
`;
function psData(data) {
  return "$data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
    Buffer.from(JSON.stringify(data)).toString('base64') + "')) | ConvertFrom-Json\n";
}

function toIco(image) {
  const png = image.resize({ width: 256, height: 256 }).toPNG();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

function updateShortcuts(shell, roots, executable, icoPath) {
  const errors = [];
  let updated = 0;
  const target = path.resolve(executable).toLowerCase();
  const seen = new Set();
  function visit(folder) {
    if (!folder || seen.has(folder.toLowerCase())) return;
    seen.add(folder.toLowerCase());
    let entries;
    try { entries = fs.readdirSync(folder, { withFileTypes: true }); }
    catch (e) { if (e.code !== 'ENOENT') errors.push(folder + ': ' + e.message); return; }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!entry.name.toLowerCase().endsWith('.lnk')) continue;
      let link;
      try { link = shell.readShortcutLink(file); } catch (_) { continue; }
      // Match the executable, including renamed links; never touch another installation.
      if (!link.target || path.resolve(link.target).toLowerCase() !== target) continue;
      try {
        if (!shell.writeShortcutLink(file, 'update', { icon: icoPath, iconIndex: 0, appUserModelId: APP_ID })) {
          throw new Error('快捷方式不可写');
        }
        updated++;
      } catch (e) { errors.push(file + ': ' + e.message); }
    }
  }
  roots.forEach(visit);
  return { updated, errors };
}

function fantinScript(iconPath, executable) {
  return psData({ iconPath, executable }) + `
$classes = [Microsoft.Win32.Registry]::ClassesRoot
$cu = [Microsoft.Win32.Registry]::CurrentUser
$ext = $classes.OpenSubKey('.fantin')
$prog = if ($ext) { [string]$ext.GetValue(''); $ext.Close() } else { '' }
$choice = $cu.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.fantin\\UserChoice')
if ($choice) { $selected = [string]$choice.GetValue('ProgId'); $choice.Close(); if ($selected) { $prog = $selected } }
if (!$prog) { $prog = '织见画板' }
if ($prog -match '[\\\\/]') { throw '无效的 Fantin 文件类型' }
$commandKey = $classes.OpenSubKey($prog + '\\shell\\open\\command')
$command = if ($commandKey) { [string]$commandKey.GetValue(''); $commandKey.Close() } else { '' }
if ($prog -ne '织见画板' -and $command.IndexOf('"' + $data.executable + '"', [StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw 'Fantin 当前由其他应用打开，请先在 Windows 设置中选择织见作为默认应用'
}
$value = '"' + $data.iconPath + '",0'
# HKCU overrides an all-users HKLM installation without requiring elevation.
# Do not decode reg.exe output: its code page can corrupt the Chinese ProgID.
foreach ($keyName in @('.fantin\\DefaultIcon', ($prog + '\\DefaultIcon'))) {
  $key = $cu.CreateSubKey('Software\\Classes\\' + $keyName)
  try { $key.SetValue('', $value, [Microsoft.Win32.RegistryValueKind]::String) } finally { $key.Close() }
}
` + REFRESH;
}

module.exports = { APP_ID, runPowerShell, REFRESH, toIco, updateShortcuts, fantinScript };
