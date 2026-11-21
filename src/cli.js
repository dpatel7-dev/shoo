'use strict';
// The `shoo` command.

const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const A = require('./ansi');
const Sprite = require('./sprite');
const Bramble = require('./hedgehog');
const Control = require('./control');

const out = (s = '') => process.stdout.write(s + '\n');
const brown = (s) => A.paint(s, { fg: '#d9a877', bold: true });
const dim = (s) => A.paint(s, { fg: '#948a80' });
const ok = (s) => A.paint(s, { fg: '#8fd4a0' });
const bad = (s) => A.paint(s, { fg: '#ff9a8a' });
const bold = (s) => A.paint(s, { bold: true });
const MAC = process.platform === 'darwin';

const HELP = `
  shoo: blocks ads. Google's full-page ads, banners, pop-ups, trackers, and
  the ads on YouTube. No administrator needed.

  shoo                 open shoo (the first time, it sets itself up)
  shoo chrome          open Chrome with shoo (also: shoo edge, shoo brave)
  shoo on              turn ad blocking on
  shoo off             turn it off
  shoo status          what shoo is doing
  shoo allow <site>    let a site through, if blocking it broke something
  shoo block <site>    block that site again
  shoo list            download the newest list of ad addresses
  shoo whole-mac       block ads in every app and Safari too (an administrator
                       of this Mac has to approve it)
  shoo update          get the newest version of shoo
  shoo uninstall       turn it off and remove shoo completely
  shoo help            this

  Without an administrator, shoo works in Chrome, Edge or Brave opened
  through shoo: use the "Chrome with shoo" app in your Applications folder
  (put it in your Dock). shoo won't change a Mac a school or company manages.
`;

function intro() {
  const art = Sprite.picture(Bramble.BIG, Bramble.MINI, Bramble.INK);
  const text = [
    '', `${brown('shoo')} ${dim('v' + Control.VERSION)}`, '',
    'Blocks ads: websites, Google\'s full-page', 'ads, trackers, and the ads on YouTube.', 'No administrator needed.', '',
    dim('Bramble keeps them out.'),
  ];
  out('');
  const w = A.vwidth(art[0] || '');
  for (let i = 0; i < Math.max(art.length, text.length); i++) out('  ' + (art[i] || ' '.repeat(w)) + '   ' + (text[i] || ''));
  out('');
}

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(true);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); resolve(!/^n/i.test(a.trim())); });
  });
}

function get(port, p, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout, headers: { host: `127.0.0.1:${port}` } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (body.length < 65536) body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function agentUp(port) {
  const r = await get(port, '/proxy.pac');
  return !!(r && r.status === 200 && /FindProxyForURL/.test(r.body));
}

async function waitForAgent(port, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await agentUp(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function needMac() {
  if (!MAC) throw new Error('shoo works on macOS for now.');
}

async function on({ confirm = true, wholeMac = false } = {}) {
  needMac();
  const state = Control.load();
  if (confirm) {
    if (wholeMac) {
      out(`  To block ads in every app and Safari too, shoo will:`);
      out(`    1. Block ad and tracker addresses for the whole Mac ${dim('(in /etc/hosts)')}`);
      out(`    2. Send YouTube through shoo, to take its ads out ${dim('(a YouTube-only certificate)')}`);
      out('');
      out(`  ${dim('An administrator of this Mac types their password, in macOS\'s own box.')}`);
    } else {
      out(`  When you turn it on, shoo will:`);
      out(`    1. Block ads and trackers in Chrome ${dim('(or Edge, or Brave) when you open it through shoo')}`);
      out(`    2. Take the ads out of YouTube ${dim('(with a certificate that works for YouTube only)')}`);
      out(`    3. Add "shoo" and "Chrome with shoo" to your Applications folder`);
      out('');
      out(`  ${dim('No administrator needed. macOS may ask for your own Mac password once.')}`);
    }
    out(`  ${dim('Turn it off any time with:')} shoo off`);
    out('');
    if (!(await ask(`  Turn shoo on? ${dim('(Y/n)')} `))) { out('\n  Okay, nothing changed.\n'); return false; }
    out('');
  }
  const r = await Control.turnOn({ mode: wholeMac ? 'mac' : 'browser', youtube: state.youtube !== false, say: (s) => out(`  ${dim('·')} ${s}`) });
  out(`  ${ok('✓')} Blocking ${bold(r.blocked.toLocaleString('en-US'))} ad and tracker addresses${wholeMac ? ' for the whole Mac' : ''}`);
  out(r.youtube ? `  ${ok('✓')} Taking the ads out of YouTube` : `  ${dim('–')} YouTube video ads: skipped ${dim('(see above)')}`);
  await waitForAgent(state.port);
  out(`  ${ok('✓')} "shoo" and "${r.browser ? r.browser.short : 'Chrome'} with shoo" are in your Applications folder`);
  out('');
  return true;
}

/** Open the browser with shoo, asking before closing one that's open without it. */
async function browser(id, { fromApp = false } = {}) {
  needMac();
  let state = Control.load();
  if (!state.on) {
    if (fromApp) await Control.turnOn({ mode: 'browser', youtube: true });
    else if (!(await on())) return;
    state = Control.load();
  }
  await ensureAgent(state.port);
  let r = await Control.openBrowser({ id });
  if (r.result === 'needs-restart') {
    const name = r.browser.short;
    const yes = fromApp
      ? require('./mac').dialog(`${name} is open without shoo, so its ads aren't blocked. Close it and open it again with shoo? Your tabs come back.`, ['Not now', `Reopen ${name}`]) === `Reopen ${name}`
      : await ask(`  ${name} is open without shoo. Close it and open it again with shoo? Your tabs come back. ${dim('(Y/n)')} `);
    if (!yes) { if (!fromApp) out(`\n  Okay. Next time, open ${name} with the "${name} with shoo" app.\n`); return; }
    r = await Control.openBrowser({ id, restart: true });
  }
  if (!fromApp) out(`  ${ok('✓')} ${r.browser.short} is ${r.result === 'focused' ? 'already open with shoo' : 'opening with shoo'}. ${dim('Keep "' + r.browser.short + ' with shoo" in your Dock: it\'s in your Applications folder.')}\n`);
}

async function ensureAgent(port) {
  if (await agentUp(port)) {
    const v = await get(port, '/version');
    if (v && v.status === 200 && v.body.trim() !== Control.VERSION) { require('./mac').restartAgent(); await waitForAgent(port); }
    return;
  }
  require('./mac').startAgent(process.execPath, path.join(Control.APP, 'bin', 'shoo.js'), Control.file('shoo.log'));
  await waitForAgent(port);
}

/** Show the dashboard, in a window of its own. */
async function dashboard(port) {
  const url = `http://127.0.0.1:${port}/`;
  const state = Control.load();
  if (MAC && state.on) {
    try {
      const r = await Control.openBrowser({ url, asApp: true });
      if (r.result !== 'needs-restart') return true;
    } catch { /* no browser shoo knows: use the normal way */ }
  }
  return require('./open').openWindow(url, { width: 1180, height: 820 });
}

async function open({ fromApp = false } = {}) {
  if (!fromApp) intro();
  if (!MAC) { out(`  ${bad('shoo works on macOS for now.')}\n`); return; }
  let state = Control.load();
  if (!state.on && !fromApp) {
    if (!(await on())) return;
    state = Control.load();
    if (Control.status().browser) await browser(undefined).catch((e) => out(`  ${bad(e.message)}`));
  }
  await ensureAgent(state.port);
  Control.makeApps(); // keep the apps up to date (and back, if they were deleted)
  const opened = await dashboard(state.port);
  if (!fromApp) {
    out(opened ? `  ${ok('✓')} shoo's window is open. ${dim('Next time: open the shoo app (Spotlight: type shoo), or type shoo here.')}` : `  Open this in your browser: ${bold(`http://127.0.0.1:${state.port}/`)}`);
    out('');
  }
}

async function status() {
  const s = Control.status();
  const state = Control.load();
  out('');
  out(`  ${brown('shoo')} ${dim('v' + s.version)}  ${s.on ? ok('on') : dim('off')}  ${dim(s.mode === 'mac' ? '(the whole Mac)' : '(in your browser)')}`);
  if (!s.on) { out(`\n  Turn it on with: ${bold('shoo on')}\n`); return; }
  out(`  ${s.blocked ? ok('✓') : bad('!')} Blocking ${bold(s.blocked.toLocaleString('en-US'))} ad and tracker addresses${s.mode === 'mac' ? ' for the whole Mac' : ''}`);
  if (s.browser) out(`  ${s.browser.state === 'shoo' ? ok('✓') : dim('·')} ${s.browser.name}: ${s.browser.state === 'shoo' ? 'open with shoo' : s.browser.state === 'plain' ? `open without shoo ${dim('(type: shoo ' + s.browser.id + ')')}` : 'not open'}`);
  const paused = state.youtubePaused;
  out(`  ${s.youtube && !paused ? ok('✓') : dim('–')} YouTube ads: ${s.youtube ? (paused ? 'paused' : 'taken out') : 'skipped'}${s.youtubeWhy ? `\n    ${dim(s.youtubeWhy)}` : ''}`);
  out(`  ${dim('·')} Today: ${s.stats.today} YouTube ads taken out, ${s.stats.web} website ads and trackers stopped`);
  const up = await agentUp(s.port);
  out(`  ${up ? ok('✓') : bad('!')} Background helper ${up ? 'running' : `not running ${dim('(type: shoo)')}`}`);
  if (s.allow.length) out(`  ${dim('·')} Let through: ${s.allow.join(', ')}`);
  if (s.listUpdated) out(`  ${dim('·')} List updated ${new Date(s.listUpdated).toLocaleDateString()}`);
  out('');
}

function installUrl(kind) {
  let site = '';
  try { site = fs.readFileSync(Control.file('hub'), 'utf8').trim(); } catch { /* from GitHub */ }
  if (/^https?:\/\//.test(site)) return `${site.replace(/\/+$/, '')}/shoo/install.${kind}`;
  return `https://raw.githubusercontent.com/dpatel7-dev/shoo/main/install.${kind}`;
}

function update() {
  const url = installUrl(process.platform === 'win32' ? 'ps1' : 'sh');
  out(`  Updating from ${url}`);
  const r = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${url} | iex`], { stdio: 'inherit' })
    : spawnSync('sh', ['-c', `curl -fsSL "${url}" | sh`], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('The update did not finish. Your current version still works.');
  if (MAC && Control.load().on) require('./mac').restartAgent();
}

async function uninstall() {
  const state = Control.load();
  if (MAC && state.on && state.mode === 'mac') {
    out('  Turning shoo off first (macOS will ask for an administrator\'s password)...');
    await Control.turnOff();
  }
  if (MAC) {
    out('  Removing the YouTube-only certificate (macOS may ask for your password)...');
    Control.forgetTrust();
    require('./mac').stopAgent();
    Control.removeApps();
  }
  let launcher = '';
  try { launcher = fs.readFileSync(Control.file('launcher'), 'utf8').trim(); } catch { /* not from the installer */ }
  if (launcher && /shoo(\.cmd)?$/.test(launcher)) fs.rmSync(launcher, { force: true });
  // everything, including the YouTube-only certificate's key
  fs.rmSync(Control.home(), { recursive: true, force: true });
  out('  shoo is uninstalled. Browsers you opened with shoo go back to normal next time you open them.');
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'help': case '--help': case '-h': return out(HELP);
    case 'version': case '--version': case '-v': return out(`shoo ${Control.VERSION}`);
    case 'serve': return require('./serve').serve({ port: Number(process.env.SHOO_PORT) || undefined });
    case 'status': return status();
    case 'on': intro(); return on({ wholeMac: rest.includes('--whole-mac') });
    case 'whole-mac': intro(); return on({ wholeMac: true });
    case 'off': {
      needMac();
      const wasMac = Control.load().mode === 'mac';
      if (wasMac) out('  Turning shoo off. macOS will ask for an administrator\'s password.');
      await Control.turnOff();
      out(`  ${ok('✓')} shoo is off.${wasMac ? ' The Mac\'s settings are back to how they were.' : ' Ads get through again until you turn it back on.'}\n`);
      return undefined;
    }
    case 'chrome': case 'edge': case 'brave': return browser(cmd, { fromApp: rest.includes('--from-app') });
    case 'browser': return browser(rest[0], { fromApp: true });
    case 'app': return open({ fromApp: true });
    case 'allow': case 'block': {
      needMac();
      if (!rest[0]) throw new Error(`Which site? Like: shoo ${cmd} example.com`);
      const site = cmd === 'allow' ? await Control.allow(rest[0]) : await Control.block(rest[0]);
      out(cmd === 'allow' ? `  ${ok('✓')} ${site} gets through now (reload the page).` : `  ${ok('✓')} ${site} is blocked again.`);
      return undefined;
    }
    case 'list': {
      needMac();
      out(`  Downloading the newest list.${Control.load().mode === 'mac' ? ' macOS will ask for an administrator\'s password.' : ''}`);
      const r = await Control.rewriteHosts({ fresh: true });
      if (r.problem) out(`  ${dim(r.problem)}`);
      out(`  ${ok('✓')} Blocking ${r.blocked.toLocaleString('en-US')} addresses.`);
      return undefined;
    }
    case 'update': case 'upgrade': return update();
    case 'uninstall': return uninstall();
    case undefined: case 'open': return open();
    default: throw new Error(`shoo doesn't know "${cmd}". Type: shoo help`);
  }
}

module.exports = { main, HELP };
