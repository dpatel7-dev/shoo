'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var config = JSON.parse($('config').textContent);
  var last = null;
  var shown = { today: -1 };

  // ── Bramble in the corner ──
  (function () {
    var b = window.BRAMBLE, g = $('bramble').getContext('2d');
    b.mini.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) { var c = row[x]; if (b.ink[c]) { g.fillStyle = b.ink[c]; g.fillRect(x, y, 1, 1); } }
    });
  })();

  // ── the forest: day in light mode, night in dark mode ──
  var media = matchMedia('(prefers-color-scheme: dark)');
  var forest = Forest.start($('forest'), { night: function () { return media.matches; }, clear: [0.22, 0.78], share: 0.42, fps: 20, mascot: 'hedgehog', scene: 'hedgerow' });
  media.addEventListener('change', function () { forest.redraw(); });

  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'x-shoo': config.token, 'content-type': 'application/json' } : { 'x-shoo': config.token },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }); });
  }

  var fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };

  // Count up to a new number instead of jumping.
  function countTo(el, to) {
    var from = shown.today < 0 ? to : shown.today;
    shown.today = to;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    var start = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - start) / 700);
      el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  function ago(iso) {
    if (!iso) return 'not yet';
    var days = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
  }

  function paint(s) {
    last = s;
    var on = s.on, whole = s.mode === 'mac';
    $('power').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('powerText').textContent = on ? 'On' : 'Off';
    $('power').title = on ? 'Turn shoo off' : 'Turn shoo on';

    var today = $('today');
    var yt = on && s.youtube && !s.youtubePaused;
    var mode = !on ? 'off' : (yt ? 'yt' : 'noyt') + (whole ? '-mac' : '-browser') + (s.youtubePaused ? '-paused' : '');
    if (today.dataset.mode !== mode) {
      today.dataset.mode = mode;
      shown.today = -1;
      if (!on) today.textContent = 'shoo is off, so ads get through. Turn it on with the switch above.';
      else {
        var first = yt ? 'Today Bramble kept <b class="yt" id="count">0</b> ads out of YouTube, and ' : 'Today Bramble ';
        var second = whole ? 'is blocking <b class="web" id="blocked">0</b> ad and tracker addresses on this whole Mac.'
          : (yt ? 'stopped' : 'stopped') + ' <b class="web" id="web">0</b> ads and trackers on websites.';
        var third = yt ? '' : s.youtubePaused ? ' YouTube blocking is paused.' : ' YouTube ads aren\'t being blocked.';
        today.innerHTML = first + second + third;
      }
    }
    if (yt) countTo($('count'), s.stats.today);
    if ($('blocked')) $('blocked').textContent = fmt(s.blocked);
    if ($('web')) $('web').textContent = fmt(s.stats.web);

    // websites
    $('webVal').textContent = on ? 'On' : 'Off';
    $('webVal').className = 'val' + (on ? ' yes' : '');
    $('webWhy').textContent = 'Ads, Google\'s full-page ads, pop-ups, trackers' + (whole ? ', in every app' : s.browser ? ', in ' + s.browser.name + ' with shoo' : '');
    // YouTube
    $('ytVal').textContent = !on ? 'Off' : !s.youtube ? 'Skipped' : s.youtubePaused ? 'Paused' : 'On';
    $('ytVal').className = 'val' + (yt ? ' yes' : '');
    $('ytWhy').textContent = on && !s.youtube && s.youtubeWhy ? s.youtubeWhy : 'Video ads, and the ads in the feed, search and Shorts';
    $('ytBtn').hidden = !(on && s.youtube);
    $('ytBtn').textContent = s.youtubePaused ? 'Resume' : 'Pause';
    // the browser
    var b = s.browser;
    $('browserRow').hidden = !b;
    if (b) {
      $('browserName').textContent = b.name + ' with shoo';
      var st = b.state;
      $('browserWhy').textContent = st === 'shoo' ? 'Open with shoo. Keep "' + b.name + ' with shoo" in your Dock.'
        : st === 'plain' ? b.name + ' is open without shoo, so its ads get through.'
        : 'Opens ' + b.name + ' with shoo. It\'s also in your Applications folder.';
      $('browserBtn').textContent = st === 'plain' ? 'Reopen with shoo' : st === 'shoo' ? 'Show' : 'Open';
      $('browserBtn').hidden = !on;
      $('browserVal').textContent = st === 'shoo' ? 'On' : st === 'plain' ? 'Not yet' : 'Closed';
      $('browserVal').className = 'val' + (st === 'shoo' ? ' yes' : '');
    }
    // the whole Mac
    $('macVal').textContent = whole && on ? 'On' : 'Off';
    $('macVal').className = 'val' + (whole && on ? ' yes' : '');
    $('macBtn').hidden = !on || whole;
    $('macWhy').textContent = whole && on ? 'An administrator approved it: ads are blocked for every app' : 'Needs an administrator of this Mac to approve it';

    var list = $('allowed');
    list.textContent = '';
    (s.allow || []).forEach(function (site) {
      var li = document.createElement('li');
      li.append(document.createTextNode(site));
      var bb = document.createElement('button');
      bb.type = 'button'; bb.textContent = 'Block again'; bb.title = 'Block ' + site + ' again';
      bb.addEventListener('click', function () { act({ action: 'block', site: site }); });
      li.append(bb);
      list.append(li);
    });
    $('listInfo').textContent = 'List of ad addresses updated ' + ago(s.listUpdated) + '.';
    setBusy(s.busy);
  }

  var BUSY = {
    on: 'Turning shoo on… macOS may ask for your own Mac password.',
    'whole-mac': 'Waiting for an administrator to type their password in the macOS box…',
    off: 'Turning shoo off…',
    list: 'Getting the newest list…',
    browser: 'Opening your browser…',
  };

  function setBusy(what) {
    $('busy').hidden = !what;
    if (what) $('busyText').textContent = BUSY[what] || (last && last.mode === 'mac' ? 'Waiting for an administrator to type their password in the macOS box…' : 'Working…');
    document.querySelectorAll('button, input').forEach(function (el) { el.disabled = !!what; });
  }

  function err(text) {
    $('error').hidden = !text;
    $('error').textContent = text || '';
  }

  function refresh() {
    return api('/api/status').then(paint).catch(function () {
      err('shoo\'s helper isn\'t answering. In Terminal, type: shoo');
    });
  }

  function act(body) {
    err('');
    if (body.action !== 'youtube') setBusy(body.action);
    return api('/api/do', body).then(function (r) {
      if (r.problem) err(r.problem);
      return refresh();
    }).catch(function (e) { err(e.message); setBusy(null); });
  }

  $('power').addEventListener('click', function () { act({ action: last && last.on ? 'off' : 'on' }); });
  $('ytBtn').addEventListener('click', function () { act({ action: 'youtube', on: !!(last && last.youtubePaused) }); });
  $('listBtn').addEventListener('click', function () { act({ action: 'list' }); });
  $('browserBtn').addEventListener('click', function () {
    var b = last && last.browser;
    if (!b) return;
    if (b.state === 'plain' && !confirm(b.name + ' will close and open again with shoo. Your tabs come back. If this window is in ' + b.name + ', it closes too: open the shoo app to get it back.')) return;
    act({ action: 'browser', id: b.id, restart: b.state === 'plain' });
  });
  $('macBtn').addEventListener('click', function () { act({ action: 'whole-mac' }); });
  $('allowForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var site = $('site').value.trim();
    if (!site) return;
    act({ action: 'allow', site: site }).then(function () { $('site').value = ''; });
  });

  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, 4000);
})();
