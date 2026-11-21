'use strict';
// Everything that touches the Mac's settings. Nothing here runs without an
// administrator typing their password into macOS's own box, and shoo refuses
// to change a Mac that a school or company manages, or one that already sends
// its web traffic through a filter or proxy.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = { networksetup: '/usr/sbin/networksetup', scutil: '/usr/sbin/scutil', profiles: '/usr/bin/profiles',
  security: '/usr/bin/security', osascript: '/usr/bin/osascript', launchctl: '/bin/launchctl', id: '/usr/bin/id',
  dscacheutil: '/usr/bin/dscacheutil', killall: '/usr/bin/killall', sw_vers: '/usr/bin/sw_vers' };
const SYSTEM_KEYCHAIN = '/Library/Keychains/System.keychain';
const LABEL = 'dev.dpatel7.shoo';

function run(cmd, args, timeout = 15000) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

// ── reading the Mac's settings (no password needed) ────────────────────────────

/** Network services that are switched on ("Wi-Fi", "Ethernet", ...). */
function parseServices(text) {
  return String(text).split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('*'));
}

/** "MDM enrollment: Yes" means a school or company manages this Mac. */
function parseEnrollment(text) {
  const t = String(text);
  if (/MDM enrollment:\s*Yes/i.test(t) || /Enrolled via DEP:\s*Yes/i.test(t)) return true;
  if (/MDM enrollment:\s*No/i.test(t)) return false;
  return null;
}

/** The proxy settings scutil reports, as { HTTPEnable: '1', ProxyAutoConfigURLString: '...', ... }. */
function parseScutil(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = /^\s*([A-Za-z]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (m && !m[2].startsWith('<')) out[m[1]] = m[2];
  }
  return out;
}

/** Is web traffic already going through a proxy or filter that isn't shoo? */
function foreignProxy(settings, ourPac) {
  const on = (k) => settings[k] === '1';
  if (on('HTTPEnable') || on('HTTPSEnable') || on('SOCKSEnable') || on('ProxyAutoDiscoveryEnable')) return true;
  if (on('ProxyAutoConfigEnable') && settings.ProxyAutoConfigURLString !== ourPac) return true;
  return false;
}

/** networksetup -getwebproxy / -getsecurewebproxy / -getsocksfirewallproxy / -getautoproxyurl output: is it on? */
function parseOnOff(text) {
  const t = String(text);
  const m = /^Enabled:\s*(Yes|No)/mi.exec(t) || /Auto Proxy Discovery:\s*(On|Off)/i.exec(t);
  return m ? /^(yes|on)$/i.test(m[1]) : false;
}

function parseUrl(text) {
  const m = /^URL:\s*(.*)$/mi.exec(String(text));
  return m && m[1] !== '(null)' ? m[1].trim() : '';
}

/** Everything shoo needs to know before it changes anything. */
function checkMac(ourPac) {
  const result = { mac: process.platform === 'darwin', version: '', managed: false, managedWhy: '', proxy: false, proxyWhere: [], admin: false, services: [] };
  if (!result.mac) return result;
  result.version = run(BIN.sw_vers, ['-productVersion']).out;

  const enroll = run(BIN.profiles, ['status', '-type', 'enrollment']);
  if (parseEnrollment(enroll.out + '\n' + enroll.err) === true) { result.managed = true; result.managedWhy = 'it is enrolled in device management (MDM)'; }
  try {
    const managedPrefs = '/Library/Managed Preferences';
    if (!result.managed && fs.existsSync(managedPrefs) && fs.readdirSync(managedPrefs).some((f) => !f.startsWith('.'))) {
      result.managed = true;
      result.managedWhy = 'it has settings put there by an organization (Managed Preferences)';
    }
  } catch { /* can't read it: not managed for our purposes */ }

  result.admin = run(BIN.id, ['-Gn']).out.split(/\s+/).includes('admin');
  result.services = parseServices(run(BIN.networksetup, ['-listallnetworkservices']).out);

  if (foreignProxy(parseScutil(run(BIN.scutil, ['--proxy']).out), ourPac)) result.proxyWhere.push('the Mac\'s current network');
  for (const svc of result.services) {
    for (const flag of ['-getwebproxy', '-getsecurewebproxy', '-getsocksfirewallproxy', '-getproxyautodiscovery']) {
      if (parseOnOff(run(BIN.networksetup, [flag, svc]).out)) { result.proxyWhere.push(svc); break; }
    }
    const auto = run(BIN.networksetup, ['-getautoproxyurl', svc]).out;
    if (parseOnOff(auto) && parseUrl(auto) !== ourPac && !result.proxyWhere.includes(svc)) result.proxyWhere.push(svc);
  }
  result.proxy = result.proxyWhere.length > 0;
  return result;
}

/** Is shoo's certificate trusted by the Mac (in the admin trust settings)? */
function isTrusted(caName) {
  if (!caName) return false;
  const r = run(BIN.security, ['dump-trust-settings', '-d']);
  return r.ok && r.out.includes(caName);
}

/** Is shoo's PAC address set (and on) for these services? */
function pacSet(services, ourPac) {
  return services.length > 0 && services.every((s) => {
    const t = run(BIN.networksetup, ['-getautoproxyurl', s]).out;
    return parseOnOff(t) && parseUrl(t) === ourPac;
  });
}

// ── changing settings (one administrator password prompt per change) ─────────

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * The commands an administrator approves. Built here (and tested) so the
 * script that runs as administrator is short and easy to read.
 */
function adminScript({ hostsFile, youtube, caFile, caSha1, removeCa, pacUrl, services = [], pacOff = [] }) {
  const lines = ['#!/bin/sh', '# shoo: changes approved by an administrator of this Mac', 'set -u'];
  if (hostsFile) {
    lines.push(
      '# 1. block ad and tracker addresses (keep a copy of the original hosts file the first time)',
      '[ -f /etc/hosts.before-shoo ] || cp -p /etc/hosts /etc/hosts.before-shoo',
      `cat ${q(hostsFile)} > /etc/hosts || exit 11`,
      `${BIN.dscacheutil} -flushcache 2>/dev/null; ${BIN.killall} -HUP mDNSResponder 2>/dev/null`,
    );
  }
  if (youtube) {
    lines.push('# 2. trust shoo\'s YouTube-only certificate, for websites only (shoo checks afterwards, and asks you if this didn\'t take)');
    lines.push(`${BIN.security} add-trusted-cert -d -r trustRoot -p ssl -k ${SYSTEM_KEYCHAIN} ${q(caFile)} || true`);
    lines.push('# 3. send YouTube (only) through shoo');
    for (const svc of services) {
      lines.push(`${BIN.networksetup} -setautoproxyurl ${q(svc)} ${q(pacUrl)} || exit 13`);
      lines.push(`${BIN.networksetup} -setautoproxystate ${q(svc)} on`);
    }
  }
  if (pacOff.length) {
    lines.push('# stop sending YouTube through shoo');
    for (const svc of pacOff) lines.push(`${BIN.networksetup} -setautoproxystate ${q(svc)} off`);
  }
  if (removeCa) {
    lines.push('# remove shoo\'s YouTube-only certificate');
    lines.push(`${BIN.security} remove-trusted-cert -d ${q(caFile)} 2>/dev/null`);
    if (caSha1) lines.push(`${BIN.security} delete-certificate -Z ${q(caSha1)} ${SYSTEM_KEYCHAIN} 2>/dev/null`);
  }
  lines.push('exit 0', '');
  return lines.join('\n');
}

/**
 * Runs a script as administrator. macOS shows its own password box; on a
 * family Mac, whoever owns it types their name and password.
 * Resolves to { ok, canceled, message }.
 */
function asAdmin(scriptFile, why) {
  const apple = [
    'on run argv',
    'do shell script "/bin/sh " & quoted form of (item 1 of argv) with prompt (item 2 of argv) with administrator privileges',
    'end run',
  ];
  const args = [];
  for (const l of apple) args.push('-e', l);
  args.push(scriptFile, why);
  const r = run(BIN.osascript, args, 300000);
  if (r.ok) return { ok: true };
  const canceled = /-128|User canceled/i.test(r.err);
  const code = (/\((\d+)\)\s*$/.exec(r.err) || [])[1];
  const what = { 11: 'write the blocked addresses', 13: 'set YouTube to go through shoo' }[code];
  return { ok: false, canceled, message: canceled ? 'The administrator box was closed, so nothing changed.' : what ? `macOS didn't let shoo ${what}.` : r.err || 'macOS said no.' };
}

/** Would macOS accept a YouTube certificate from shoo right now? (leaf and authority files) */
function trustWorks(leafFile, caFile) {
  const r = run(BIN.security, ['verify-cert', '-c', leafFile, '-c', caFile, '-p', 'ssl', '-s', 'www.youtube.com', '-L', '-q']);
  return r.ok;
}

function loginKeychain() {
  return path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db');
}

/** Trust the certificate for this user only (macOS asks for your own password). */
function trustAsUser(caFile) {
  return run(BIN.security, ['add-trusted-cert', '-r', 'trustRoot', '-p', 'ssl', '-k', loginKeychain(), caFile], 120000).ok;
}

/** Remove the user-level trust (if it was ever needed). Quietly does nothing otherwise. */
function untrustAsUser(caFile, sha1) {
  run(BIN.security, ['remove-trusted-cert', caFile], 120000);
  if (sha1) run(BIN.security, ['delete-certificate', '-Z', sha1, loginKeychain()]);
}

// ── apps in your Applications folder (no administrator needed) ────────────────

function appsDir() {
  return path.join(os.homedir(), 'Applications');
}

function infoPlist({ name, id, exec, version }) {
  const x = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${x(name)}</string>
  <key>CFBundleDisplayName</key><string>${x(name)}</string>
  <key>CFBundleIdentifier</key><string>${x(id)}</string>
  <key>CFBundleExecutable</key><string>${x(exec)}</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${x(version)}</string>
  <key>CFBundleVersion</key><string>${x(version)}</string>
  <key>LSMinimumSystemVersion</key><string>10.15</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
}

/**
 * A small app in ~/Applications that runs a shoo command, so it shows up in
 * Spotlight and Launchpad and can sit in the Dock.
 */
function makeApp({ name, id, args, icon, node, script, version }) {
  const app = path.join(appsDir(), `${name}.app`);
  const contents = path.join(app, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(contents, 'Info.plist'), infoPlist({ name, id, exec: 'run', version }));
  const quote = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  fs.writeFileSync(path.join(contents, 'MacOS', 'run'), `#!/bin/sh\n# ${name}: made by shoo. Remove it with: shoo uninstall\nexec ${quote(node)} ${quote(script)} ${args.map(quote).join(' ')} >> "$HOME/.shoo/app.log" 2>&1\n`, { mode: 0o755 });
  if (icon && fs.existsSync(icon)) fs.copyFileSync(icon, path.join(contents, 'Resources', 'icon.icns'));
  // tell macOS about it, so Spotlight and Launchpad find it straight away
  run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app]);
  return app;
}

/** A small macOS question box (for the apps, which have no Terminal). Resolves to the button picked. */
function dialog(message, buttons, title = 'shoo') {
  const lines = [
    'on run argv',
    'set btns to {}',
    'repeat with i from 3 to count of argv',
    'set end of btns to item i of argv',
    'end repeat',
    'display dialog (item 1 of argv) with title (item 2 of argv) buttons btns default button (count of btns)',
    'return button returned of result',
    'end run',
  ];
  const args = [];
  for (const l of lines) args.push('-e', l);
  const r = run(BIN.osascript, [...args, message, title, ...buttons], 600000);
  return r.ok ? r.out : '';
}

function removeApp(name) {
  fs.rmSync(path.join(appsDir(), `${name}.app`), { recursive: true, force: true });
}

function flushDns() {
  run(BIN.dscacheutil, ['-flushcache']);
}

// ── starting shoo when you log in ──────────────────────────────────────────────

function plistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

function plist(node, script, logFile) {
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${x(node)}</string><string>${x(script)}</string><string>serve</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${x(logFile)}</string>
  <key>StandardErrorPath</key><string>${x(logFile)}</string>
</dict>
</plist>
`;
}

function startAgent(node, script, logFile) {
  const file = plistPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, plist(node, script, logFile));
  const domain = `gui/${process.getuid()}`;
  run(BIN.launchctl, ['bootout', `${domain}/${LABEL}`]);
  const r = run(BIN.launchctl, ['bootstrap', domain, file]);
  if (!r.ok) run(BIN.launchctl, ['load', '-w', file]);
  run(BIN.launchctl, ['kickstart', '-k', `${domain}/${LABEL}`]);
}

function restartAgent() {
  run(BIN.launchctl, ['kickstart', '-k', `gui/${process.getuid()}/${LABEL}`]);
}

function stopAgent() {
  const file = plistPath();
  run(BIN.launchctl, ['bootout', `gui/${process.getuid()}/${LABEL}`]);
  if (fs.existsSync(file)) { run(BIN.launchctl, ['unload', '-w', file]); fs.rmSync(file, { force: true }); }
}

module.exports = {
  checkMac, isTrusted, pacSet, adminScript, asAdmin, flushDns, trustWorks, trustAsUser, untrustAsUser, makeApp, removeApp, appsDir, infoPlist, dialog, startAgent, restartAgent, stopAgent, plist, plistPath,
  parseServices, parseEnrollment, parseScutil, foreignProxy, parseOnOff, parseUrl, LABEL,
};
