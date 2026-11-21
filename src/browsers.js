'use strict';
// Opening Chrome (or Edge, or Brave) with shoo, so it can block ads without
// an administrator: the browser is started with one setting, "use shoo's PAC
// file", which needs nobody's permission. If the browser is already open
// without it, shoo can close it and open it again with your tabs.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const LIST = [
  { id: 'chrome', name: 'Google Chrome', short: 'Chrome' },
  { id: 'edge', name: 'Microsoft Edge', short: 'Edge' },
  { id: 'brave', name: 'Brave Browser', short: 'Brave' },
];

function appPath(b) {
  for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
    const p = path.join(dir, `${b.name}.app`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** The browsers on this Mac that shoo can work with, Chrome first. */
function installed() {
  return LIST.filter((b) => appPath(b));
}

function find(id) {
  return LIST.find((b) => b.id === id) || null;
}

const flag = (pacUrl) => `--proxy-pac-url=${pacUrl}`;

/** The browser's main process ids (not its helpers). */
function pids(b) {
  const r = spawnSync('/usr/bin/pgrep', ['-x', b.name], { encoding: 'utf8' });
  return (r.stdout || '').split('\n').map((s) => Number(s.trim())).filter(Boolean);
}

/** 'off' (not open), 'shoo' (open with shoo), or 'plain' (open without shoo). */
function state(b, pacUrl) {
  const list = pids(b);
  if (!list.length) return 'off';
  for (const pid of list) {
    const args = spawnSync('/bin/ps', ['-o', 'args=', '-p', String(pid)], { encoding: 'utf8' }).stdout || '';
    if (args.includes(flag(pacUrl))) return 'shoo';
  }
  return 'plain';
}

function launch(app, args) {
  const child = spawn('/usr/bin/open', ['-a', app, ...(args.length ? ['--args', ...args] : [])], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Open the browser with shoo. With `restart`, a browser that's open without
 * shoo is closed (it saves your tabs) and opened again with them.
 * `url` opens a page too (`asApp` makes it a window of its own).
 * Resolves to 'opened', 'focused', 'restarted' or 'needs-restart'.
 */
async function open(b, pacUrl, { restart = false, url = '', asApp = false } = {}) {
  const app = appPath(b);
  if (!app) throw new Error(`${b.name} isn't installed.`);
  const page = url ? [asApp ? `--app=${url}` : url] : [];
  const now = state(b, pacUrl);
  if (now === 'shoo') {
    if (page.length) spawn('/usr/bin/open', ['-na', app, '--args', ...page], { stdio: 'ignore', detached: true }).unref();
    else launch(app, []);
    return 'focused';
  }
  if (now === 'plain') {
    if (!restart) return 'needs-restart';
    for (const pid of pids(b)) { try { process.kill(pid, 'SIGTERM'); } catch { /* already closing */ } }
    for (let i = 0; i < 60 && pids(b).length; i++) await sleep(250);
    if (pids(b).length) throw new Error(`${b.short} didn't close. Quit it yourself (Cmd+Q), then try again.`);
    launch(app, [flag(pacUrl), '--restore-last-session', ...page]);
    return 'restarted';
  }
  launch(app, [flag(pacUrl), ...page]);
  return 'opened';
}

module.exports = { LIST, installed, find, appPath, state, open, flag };
