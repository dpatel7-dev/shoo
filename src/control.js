'use strict';
// Turning shoo on and off, updating the block list and letting sites through.
// Used by the `shoo` command and by its dashboard.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Hosts = require('./hosts');
const Mac = require('./mac');
const CA = require('./ca');
const Browsers = require('./browsers');

const APP = path.join(__dirname, '..');
const VERSION = require('../package.json').version;
const home = () => process.env.SHOO_HOME || path.join(os.homedir(), '.shoo');
const file = (name) => path.join(home(), name);
const HOSTS = process.env.SHOO_HOSTS_FILE || '/etc/hosts';

// mode: 'browser' (no administrator: Chrome, Edge or Brave opened through shoo)
//    or 'mac' (an administrator approved it: every app on the Mac)
const DEFAULTS = { on: false, mode: 'browser', youtube: true, port: 8689, allow: [], listCount: 0, listUpdated: null, note: '', browser: '' };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file('state.json'), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}

function save(state) {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file('state.json'), JSON.stringify(state, null, 2) + '\n');
  return state;
}

const pacUrl = (state) => `http://127.0.0.1:${state.port}/proxy.pac`;
const browserPacUrl = (state) => `http://127.0.0.1:${state.port}/browser.pac`;

// ── counting: YouTube ads taken out, and website ads stopped (in the browser) ──

function today() { return new Date().toLocaleDateString('en-CA'); }

function readStats() {
  let s;
  try { s = JSON.parse(fs.readFileSync(file('stats.json'), 'utf8')); } catch { s = { days: {}, total: 0 }; }
  for (const k of Object.keys(s.days || {})) if (typeof s.days[k] === 'number') s.days[k] = { youtube: s.days[k], web: 0 }; // 1.0 kept one number
  s.days = s.days || {};
  return s;
}

let pending = null;
let saveTimer = null;
function countAds(n, kind = 'youtube') {
  if (!pending) pending = readStats();
  const d = today();
  const day = pending.days[d] || (pending.days[d] = { youtube: 0, web: 0 });
  day[kind] = (day[kind] || 0) + n;
  pending.total = (pending.total || 0) + n;
  // keep a month of days
  const keys = Object.keys(pending.days).sort();
  while (keys.length > 31) delete pending.days[keys.shift()];
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(file('stats.json'), JSON.stringify(pending)); } catch { /* next time */ }
  }, 1500);
  saveTimer.unref?.();
}

function stats() {
  const s = pending || readStats();
  const d = s.days[today()] || { youtube: 0, web: 0 };
  return { today: d.youtube || 0, web: d.web || 0, total: s.total || 0 };
}

// ── the block list ─────────────────────────────────────────────────────────────

/** The downloaded list (fresh if asked, else the saved copy). Never fails: falls back to the built-in list. */
async function getList(fresh) {
  const cache = file('blocklist.txt');
  if (fresh || !fs.existsSync(cache)) {
    try {
      const set = await Hosts.download();
      fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
      fs.writeFileSync(cache, [...set].join('\n') + '\n');
      return { set, fresh: true };
    } catch (e) {
      if (!fs.existsSync(cache)) return { set: new Set(), fresh: false, problem: `Couldn't download the big block list (${e.message}), so shoo is using its own shorter list for now.` };
    }
  }
  return { set: new Set(fs.readFileSync(cache, 'utf8').split('\n').filter(Boolean)), fresh: false };
}

function hostsNow() {
  try { return fs.readFileSync(HOSTS, 'utf8'); } catch { return ''; }
}

function blockedCount() {
  return Hosts.countIn(hostsNow());
}

// ── what shoo is doing right now ───────────────────────────────────────────────

function status() {
  const state = load();
  const authority = fs.existsSync(file('youtube-only-ca.pem')) ? CA.loadAuthority(home()) : null;
  const browsers = process.platform === 'darwin' ? usableBrowsers() : [];
  const chosen = Browsers.find(state.browser) || browsers[0] || null;
  return {
    version: VERSION,
    on: state.on,
    mode: state.mode,
    managed: !!state.managed,
    blocked: state.mode === 'mac' ? blockedCount() : state.on ? state.listCount : 0,
    browser: chosen ? { id: chosen.id, name: chosen.short, state: process.platform === 'darwin' ? Browsers.state(chosen, browserPacUrl(state)) : 'off' } : null,
    browsers: browsers.map((b) => ({ id: b.id, name: b.short })),
    youtube: state.on && state.youtube,
    youtubeWhy: (state.youtubePaused && state.pauseWhy) || state.note,
    allow: state.allow,
    listUpdated: state.listUpdated,
    port: state.port,
    caName: authority ? authority.name : '',
    stats: stats(),
  };
}

// ── changes ────────────────────────────────────────────────────────────────────

function writeScript(text) {
  const f = file('admin.sh');
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(f, text, { mode: 0o700 });
  return f;
}

/** Refuses on a managed Mac. Returns the checks for the caller to show. */
/**
 * Checks before turning on. On a Mac a school or company manages, shoo never
 * changes the Mac's settings, so the whole-Mac way is refused; the browser way
 * changes nothing on the Mac and leaves the school's filters in place.
 */
function preflight(state, mode = 'mac') {
  const checks = Mac.checkMac(pacUrl(state));
  if (!checks.mac) throw new Error('shoo works on macOS for now.');
  if (checks.managed && mode === 'mac') {
    const e = new Error(`This Mac is managed by an organization (like a school): ${checks.managedWhy}. shoo won't change its settings, so blocking ads in every app stays off. shoo still blocks ads in Chrome without touching anything: type shoo on`);
    e.managed = true;
    throw e;
  }
  return checks;
}

/** The browsers shoo can use: installed, and not ones whose network settings the school controls. */
function usableBrowsers() {
  return Browsers.installed().filter((b) => !Mac.browserProxyPolicy(b.bundle));
}

/** Is the YouTube-only certificate trusted by macOS right now? */
function trusted(authority) {
  const leaf = file('check-leaf.pem');
  fs.writeFileSync(leaf, CA.issuer(authority).certFor('www.youtube.com').split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----\n');
  return Mac.trustWorks(leaf, authority.file);
}

/** The little apps in ~/Applications: shoo (opens the dashboard) and "<browser> with shoo". */
function makeApps() {
  const node = process.execPath;
  const script = path.join(APP, 'bin', 'shoo.js');
  const made = [Mac.makeApp({ name: 'shoo', id: 'dev.dpatel7.shoo.app', args: ['app'], icon: path.join(APP, 'assets', 'shoo.icns'), node, script, version: VERSION })];
  for (const b of usableBrowsers()) {
    made.push(Mac.makeApp({ name: `${b.short} with shoo`, id: `dev.dpatel7.shoo.${b.id}`, args: ['browser', b.id], icon: path.join(APP, 'assets', 'browser.icns'), node, script, version: VERSION }));
  }
  return made;
}

function removeApps() {
  Mac.removeApp('shoo');
  for (const b of Browsers.LIST) Mac.removeApp(`${b.short} with shoo`);
}

/**
 * Turn shoo on. mode 'browser' needs no administrator: it blocks ads in Chrome
 * (or Edge, or Brave) opened through shoo. mode 'mac' blocks them for every app,
 * and an administrator has to approve it. `say` gets progress lines.
 */
async function turnOn({ mode = 'browser', youtube = true, say = () => {} } = {}) {
  return mode === 'mac' ? turnOnMac({ youtube, say }) : turnOnBrowser({ youtube, say });
}

async function turnOnBrowser({ youtube = true, say = () => {} } = {}) {
  const state = load();
  const checks = preflight(state, 'browser');
  if (checks.proxy) {
    throw new Error(`This Mac sends web traffic through a filter or proxy (${checks.proxyWhere.join(', ')}), often set up by a school or a parent. Opening your browser through shoo would go around it, so shoo won't.`);
  }
  if (!Browsers.installed().length) throw new Error('shoo works with Google Chrome, Microsoft Edge or Brave, and none of them is in your Applications folder.');
  const usable = usableBrowsers();
  if (!usable.length) {
    throw new Error(`Your school (or whoever manages this Mac) controls ${Browsers.installed().map((b) => b.short).join(' and ')}'s network settings, so shoo can't block ads in it without going around them. It won't.`);
  }
  state.managed = checks.managed;
  if (checks.managed) say('This Mac is managed by a school or company. shoo won\'t touch any of its settings: it only works inside your browser, and the school\'s filters still apply.');
  state.note = '';
  say('Getting the list of ad and tracker addresses...');
  const list = await getList(!state.listUpdated || Date.now() - Date.parse(state.listUpdated) > 7 * 864e5);
  if (list.problem) say(list.problem);
  const domains = Hosts.blocklist(list.set, []);

  const authority = CA.loadAuthority(home());
  Mac.startAgent(process.execPath, path.join(APP, 'bin', 'shoo.js'), file('shoo.log'));

  let youtubeOk = youtube;
  if (youtubeOk && !trusted(authority)) {
    say('macOS will ask for your own Mac password (not an administrator\'s) to trust shoo\'s YouTube-only certificate.');
    state.userTrust = Mac.trustAsUser(authority.file) || state.userTrust;
    if (!trusted(authority)) {
      youtubeOk = false;
      state.note = 'macOS didn\'t trust shoo\'s YouTube-only certificate, so YouTube ads aren\'t being blocked. Turn shoo off and on again to try once more.';
      say(state.note);
    }
  }
  makeApps();

  state.on = true;
  if (state.mode !== 'mac') state.mode = 'browser';
  state.youtube = youtubeOk;
  state.youtubePaused = false;
  state.listCount = domains.length;
  if (!state.browser || !usable.some((b) => b.id === state.browser)) state.browser = usable[0].id;
  if (list.fresh) state.listUpdated = new Date().toISOString();
  save(state);
  return { blocked: domains.length, youtube: youtubeOk, note: state.note, browser: Browsers.find(state.browser) };
}

/** Open the browser with shoo (restart: close and reopen it if it's open without shoo). */
async function openBrowser({ id, restart = false, url = '', asApp = false } = {}) {
  const state = load();
  const b = Browsers.find(id || state.browser) || usableBrowsers()[0];
  if (b && Mac.browserProxyPolicy(b.bundle)) throw new Error(`Your school controls ${b.short}'s network settings, so shoo can't block ads in it.`);
  if (!b) throw new Error('shoo works with Google Chrome, Microsoft Edge or Brave, and none of them is installed.');
  if (id && state.browser !== b.id) { state.browser = b.id; save(state); }
  return { browser: b, result: await Browsers.open(b, browserPacUrl(state), { restart, url, asApp }) };
}

async function turnOnMac({ youtube = true, say = () => {} } = {}) {
  const state = load();
  const checks = preflight(state);
  let youtubeOk = youtube;
  state.note = '';
  if (youtube && checks.proxy) {
    youtubeOk = false;
    state.note = `This Mac already sends web traffic through a proxy or filter (${checks.proxyWhere.join(', ')}), often set up by a school or a parent. shoo won't change that, so it's skipping YouTube video ads.`;
    say(state.note);
  }

  say('Getting the list of ad and tracker addresses...');
  const list = await getList(!state.listUpdated || Date.now() - Date.parse(state.listUpdated) > 7 * 864e5);
  if (list.problem) say(list.problem);
  const domains = Hosts.blocklist(list.set, state.allow);
  const next = file('hosts.next');
  fs.writeFileSync(next, Hosts.withShoo(hostsNow(), domains));

  let authority = null;
  if (youtubeOk) authority = CA.loadAuthority(home());

  // Start the part that handles YouTube (and the dashboard) before pointing the Mac at it.
  Mac.startAgent(process.execPath, path.join(APP, 'bin', 'shoo.js'), file('shoo.log'));

  const script = writeScript(Mac.adminScript({
    hostsFile: next,
    youtube: youtubeOk,
    caFile: authority && authority.file,
    pacUrl: pacUrl(state),
    services: checks.services,
  }));
  say('macOS will ask for an administrator\'s password now.');
  const r = Mac.asAdmin(script, 'shoo wants to block ads on this Mac. An administrator of this Mac needs to approve it.');
  if (!r.ok) throw new Error(r.message);

  // Check that macOS really trusts the YouTube-only certificate. If it doesn't, YouTube
  // simply goes straight to the internet (shoo serves a "DIRECT" PAC file), so nothing breaks.
  if (youtubeOk) {
    const works = () => trusted(authority);
    if (!works()) {
      say('macOS will ask for your password to trust shoo\'s YouTube-only certificate.');
      state.userTrust = Mac.trustAsUser(authority.file);
      if (!works()) {
        youtubeOk = false;
        state.note = 'macOS didn\'t trust shoo\'s YouTube-only certificate, so YouTube ads aren\'t being blocked. Try "shoo on" again.';
        say(state.note);
      }
    }
  }

  makeApps();
  state.on = true;
  state.mode = 'mac';
  state.youtube = youtubeOk;
  state.youtubePaused = false;
  state.listCount = domains.length;
  if (list.fresh) state.listUpdated = new Date().toISOString();
  save(state);
  return { blocked: domains.length, youtube: youtubeOk, note: state.note };
}

/**
 * Turn shoo off. In browser mode that's just a switch (the browser's PAC file
 * says "go straight there" from now on). In whole-Mac mode an administrator
 * puts the hosts file and network settings back.
 */
async function turnOff() {
  const state = load();
  if (process.platform !== 'darwin') throw new Error('shoo works on macOS for now.');
  if (state.mode !== 'mac') {
    state.on = false;
    save(state);
    return;
  }
  const services = Mac.parseServices(require('child_process').spawnSync('/usr/sbin/networksetup', ['-listallnetworkservices'], { encoding: 'utf8' }).stdout || '');
  const ours = services.filter((s) => {
    const t = require('child_process').spawnSync('/usr/sbin/networksetup', ['-getautoproxyurl', s], { encoding: 'utf8' }).stdout || '';
    return Mac.parseUrl(t) === pacUrl(state);
  });
  const clean = file('hosts.clean');
  fs.writeFileSync(clean, Hosts.withoutShoo(hostsNow()));
  const authority = fs.existsSync(file('youtube-only-ca.pem')) ? CA.loadAuthority(home()) : null;
  const script = writeScript(Mac.adminScript({
    hostsFile: clean,
    pacOff: ours,
    removeCa: !!authority,
    caFile: authority && authority.file,
    caSha1: authority && authority.fingerprint,
  }));
  const r = Mac.asAdmin(script, 'shoo wants to stop blocking ads and put this Mac\'s settings back. An administrator needs to approve it.');
  if (!r.ok) throw new Error(r.message);
  state.on = false;
  state.mode = 'browser';
  save(state);
}

/** Remove the certificate trust you gave (macOS asks for your password). */
function forgetTrust() {
  const state = load();
  const authority = fs.existsSync(file('youtube-only-ca.pem')) ? CA.loadAuthority(home()) : null;
  if (authority && state.userTrust) Mac.untrustAsUser(authority.file, authority.fingerprint);
}

/** Rewrite just the blocked addresses (after a new list or a change to the sites you let through). */
async function rewriteHosts({ fresh = false } = {}) {
  const state = load();
  if (!state.on || state.mode !== 'mac') {
    // the browser way: shoo's blocker reads the list itself, no password needed
    const list = await getList(fresh);
    state.listCount = Hosts.blocklist(list.set, []).length;
    if (list.fresh) state.listUpdated = new Date().toISOString();
    save(state);
    return { blocked: state.listCount, problem: list.problem };
  }
  preflight(state);
  const list = await getList(fresh);
  const domains = Hosts.blocklist(list.set, state.allow);
  const next = file('hosts.next');
  fs.writeFileSync(next, Hosts.withShoo(hostsNow(), domains));
  const r = Mac.asAdmin(writeScript(Mac.adminScript({ hostsFile: next })), 'shoo wants to update the ad addresses it blocks. An administrator needs to approve it.');
  if (!r.ok) throw new Error(r.message);
  state.listCount = domains.length;
  if (list.fresh) state.listUpdated = new Date().toISOString();
  save(state);
  return { blocked: domains.length, problem: list.problem };
}

/** Let a site through (if blocking it broke something). */
async function allow(site) {
  const d = Hosts.normal(site);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new Error(`"${site}" doesn't look like a website address. Try something like example.com`);
  const state = load();
  if (!state.allow.includes(d)) state.allow.push(d);
  save(state);
  await rewriteHosts();
  return d;
}

/** Block a site again. */
async function block(site) {
  const d = Hosts.normal(site);
  const state = load();
  state.allow = state.allow.filter((x) => x !== d);
  save(state);
  await rewriteHosts();
  return d;
}

/** Turn just the YouTube part on or off (no password: the PAC file shoo serves changes). */
function setYoutube(on, why = '') {
  const state = load();
  state.youtubePaused = !on;
  state.pauseWhy = on ? '' : why;
  save(state);
  return state;
}

module.exports = { preflight, usableBrowsers, load, save, status, turnOn, turnOff, rewriteHosts, allow, block, setYoutube, countAds, stats, getList, openBrowser, makeApps, removeApps, forgetTrust, pacUrl, browserPacUrl, home, file, VERSION, APP };
