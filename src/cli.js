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
  shoo: blocks ads on your whole Mac. Google's full-page ads, banners,
  pop-ups and trackers, in every browser and app, and the ads on YouTube.

  shoo                 open shoo (the first time, it sets itself up)
  shoo on              turn ad blocking on
  shoo off             turn it off and put the Mac's settings back
  shoo status          what shoo is doing
  shoo allow <site>    let a site through, if blocking it broke something
  shoo block <site>    block that site again
  shoo list            download the newest list of ad addresses
  shoo update          get the newest version of shoo
  shoo uninstall       turn it off and remove shoo completely
  shoo help            this

  Turning shoo on or off needs an administrator of this Mac to type their
  password into macOS's own box. shoo won't change a Mac that a school or
  company manages.
`;

function intro() {
  const art = Sprite.picture(Bramble.BIG, Bramble.MINI, Bramble.INK);
  const text = [
    '', `${brown('shoo')} ${dim('v' + Control.VERSION)}`, '',
    'Blocks ads on this whole Mac:', 'websites, Google\'s full-page ads, trackers,', 'and the ads on YouTube.', '',
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

async function on({ confirm = true } = {}) {
  needMac();
  const state = Control.load();
  if (confirm) {
    out(`  When you turn it on, shoo will:`);
    out(`    1. Block ad and tracker addresses for the whole Mac ${dim('(in /etc/hosts)')}`);
    out(`    2. Take the ads out of YouTube ${dim('(with a certificate that works for YouTube only)')}`);
    out(`    3. Start when you log in ${dim('(a small background helper)')}`);
    out('');
    out(`  ${dim('An administrator of this Mac types their password once, in macOS\'s own box.')}`);
    out(`  ${dim('Everything goes back with:')} shoo off`);
    out('');
    if (!(await ask(`  Turn shoo on? ${dim('(Y/n)')} `))) { out('\n  Okay, nothing changed.\n'); return false; }
    out('');
  }
  const r = await Control.turnOn({ youtube: state.youtube !== false, say: (s) => out(`  ${dim('·')} ${s}`) });
  out(`  ${ok('✓')} Blocking ${bold(r.blocked.toLocaleString('en-US'))} ad and tracker addresses`);
  out(r.youtube ? `  ${ok('✓')} Taking the ads out of YouTube` : `  ${dim('–')} YouTube video ads: skipped ${dim('(see above)')}`);
  await waitForAgent(state.port);
  out(`  ${ok('✓')} shoo starts by itself when you log in`);
  out('');
  out(`  ${dim('Already-open tabs may still show ads until you reload them.')}`);
  out('');
  return true;
}

async function open() {
  intro();
  if (!MAC) { out(`  ${bad('shoo works on macOS for now.')}\n`); return; }
  let state = Control.load();
  if (!state.on) {
    if (!(await on())) return;
    state = Control.load();
  }
  if (!(await agentUp(state.port))) {
    require('./mac').startAgent(process.execPath, path.join(Control.APP, 'bin', 'shoo.js'), Control.file('shoo.log'));
    await waitForAgent(state.port);
  } else {
    const v = await get(state.port, '/version');
    if (v && v.status === 200 && v.body.trim() !== Control.VERSION) { require('./mac').restartAgent(); await waitForAgent(state.port); }
  }
  const url = `http://127.0.0.1:${state.port}/`;
  const { openWindow } = require('./open');
  const opened = openWindow(url, { width: 1180, height: 820 });
  out(opened ? `  ${ok('✓')} shoo is open in its own window. ${dim('You can close this terminal.')}` : `  Open this in your browser: ${bold(url)}`);
  out('');
}

async function status() {
  const s = Control.status();
  const state = Control.load();
  out('');
  out(`  ${brown('shoo')} ${dim('v' + s.version)}  ${s.on ? ok('on') : dim('off')}`);
  if (!s.on) { out(`\n  Turn it on with: ${bold('shoo on')}\n`); return; }
  out(`  ${s.blocked ? ok('✓') : bad('!')} Blocking ${bold(s.blocked.toLocaleString('en-US'))} ad and tracker addresses`);
  const paused = state.youtubePaused;
  out(`  ${s.youtube && !paused ? ok('✓') : dim('–')} YouTube ads: ${s.youtube ? (paused ? 'paused' : 'taken out') : 'skipped'}${s.youtubeWhy ? `\n    ${dim(s.youtubeWhy)}` : ''}`);
  out(`  ${dim('·')} ${s.stats.today} YouTube ads taken out today, ${s.stats.total} in all`);
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
  if (MAC && Control.load().on) {
    out('  Turning shoo off first (macOS will ask for an administrator\'s password)...');
    await Control.turnOff();
  }
  if (MAC) require('./mac').stopAgent();
  let launcher = '';
  try { launcher = fs.readFileSync(Control.file('launcher'), 'utf8').trim(); } catch { /* not from the installer */ }
  if (launcher && /shoo(\.cmd)?$/.test(launcher)) fs.rmSync(launcher, { force: true });
  // everything, including the YouTube-only certificate's key
  fs.rmSync(Control.home(), { recursive: true, force: true });
  out('  shoo is uninstalled, and the Mac\'s settings are back to how they were.');
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'help': case '--help': case '-h': return out(HELP);
    case 'version': case '--version': case '-v': return out(`shoo ${Control.VERSION}`);
    case 'serve': return require('./serve').serve({ port: Number(process.env.SHOO_PORT) || undefined });
    case 'status': return status();
    case 'on': intro(); return on();
    case 'off': {
      needMac();
      out('  Turning shoo off. macOS will ask for an administrator\'s password.');
      await Control.turnOff();
      out(`  ${ok('✓')} shoo is off. The Mac's settings are back to how they were.\n`);
      return undefined;
    }
    case 'allow': case 'block': {
      needMac();
      if (!rest[0]) throw new Error(`Which site? Like: shoo ${cmd} example.com`);
      const site = cmd === 'allow' ? await Control.allow(rest[0]) : await Control.block(rest[0]);
      out(cmd === 'allow' ? `  ${ok('✓')} ${site} gets through now (reload the page).` : `  ${ok('✓')} ${site} is blocked again.`);
      return undefined;
    }
    case 'list': {
      needMac();
      out('  Downloading the newest list. macOS will ask for an administrator\'s password.');
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
