# shoo

**Blocks ads on your whole Mac**: Google's full-page "vignette" ads, banners, pop-ups and trackers in every browser and app, and the ads on YouTube. It's an app, not a browser extension. Bramble the hedgehog keeps them out.

<img src="docs/dashboard.png" width="720" alt="shoo's window: a glass panel over a pixel forest, saying how many ads it kept out today">

## What it blocks

| | How |
|---|---|
| **Websites and apps**: ads, Google's full-page ads, pop-ups, trackers | The Mac is told that ad and tracker addresses (about 100,000 of them) lead nowhere, so the ads never load, in every browser and app. |
| **YouTube**: video ads, and ads in the home feed, search, "up next" and Shorts | YouTube's ads come from the same servers as its videos, so shoo reads YouTube's pages on your Mac and takes the ads out before your browser sees them. |

No ad blocker catches every ad. YouTube changes its site often, so now and then an ad may slip through until shoo is updated (`shoo update`, or update it in pca).

## Install it

**On a Mac:** open Terminal, paste this and press Enter:

```sh
curl -fsSL https://djp7.pythonanywhere.com/shoo/install.sh | sh
```

Then open a **new** Terminal window and type:

```sh
shoo
```

Already have [pca](https://github.com/dpatel7-dev/Project-CLI-Access)? Type `pca`, pick **shoo** (Bramble the hedgehog) and press Enter.

The first time, shoo shows what it's going to do and asks **Turn shoo on?** Press Enter. Then **macOS shows its own password box**: an administrator of this Mac types their name and password. On a family Mac, that's whoever owns it. That's the only time it's needed.

Tabs you already had open may still show ads until you reload them.

## Commands

| Command | What it does |
|---|---|
| `shoo` | open shoo's window (the first time, it sets itself up) |
| `shoo on` / `shoo off` | turn ad blocking on, or off (off puts every setting back) |
| `shoo status` | what shoo is doing |
| `shoo allow example.com` | let a site through, if blocking it broke something |
| `shoo block example.com` | block it again |
| `shoo list` | download the newest list of ad addresses |
| `shoo update` | get the newest version of shoo |
| `shoo uninstall` | turn it off and remove shoo completely |

Turning shoo on or off, and changing which sites get through, asks for an administrator's password each time.

## Safe by design

- **It won't change a Mac that a school or company manages.** If the Mac is enrolled in device management, shoo stops and says so. Blocking ads there is up to whoever manages it.
- **It won't go around a filter.** If the Mac already sends web traffic through a proxy or filter (often set up by a school or a parent), shoo leaves it alone. It still blocks website ads, but it skips YouTube.
- **Only YouTube passes through shoo.** Everything else goes straight to the internet as usual. If shoo isn't running, YouTube goes straight there too, so shoo can't break your internet.
- **The certificate works for YouTube only.** To read YouTube's pages, shoo makes its own certificate on your Mac, limited to youtube.com and youtube-nocookie.com, so it can't be used for any other website, even by someone who copied it. It's removed by `shoo off`.
- **Nothing leaves your Mac.** shoo doesn't collect or send anything. It only downloads the public list of ad addresses ([StevenBlack/hosts](https://github.com/StevenBlack/hosts)) and its own updates.
- **Everything goes back.** `shoo off` restores the hosts file, turns off the YouTube setting and removes the certificate. The original hosts file is also kept as `/etc/hosts.before-shoo`.

## If something goes wrong

- **A website looks broken:** in shoo's window, type the site under "Is a site not working?" and click **Let it through**. Or type `shoo allow example.com`.
- **YouTube won't load:** click **Pause** next to YouTube in shoo's window, or type `shoo off`.
- **Firefox:** Firefox keeps its own list of trusted certificates. If YouTube shows a certificate warning there, type `about:config` in the address bar and set `security.enterprise_roots.enabled` to `true`. Chrome, Safari, Edge and Brave work without this.
- **Safari with iCloud Private Relay:** Private Relay sends Safari's traffic its own way, so shoo can't see it. Turn Private Relay off for your network, or use Chrome for YouTube.
- **See what's happening:** `shoo status`. The helper's log is in `~/.shoo/shoo.log`.

## How it works (for the curious)

- `src/hosts.js` keeps shoo's lines in their own section of `/etc/hosts` and never touches the rest.
- `src/ca.js` builds the YouTube-only certificate (name constrained, no IP addresses).
- `src/proxy.js` and `src/prune.js` handle YouTube: a proxy auto-config file sends only YouTube's addresses to `127.0.0.1:8689`, and shoo removes `adPlacements`, `playerAds`, ad slots and promoted items from the pages and the player's data.
- `src/mac.js` holds the safety checks and the few commands an administrator approves.
- A small helper starts when you log in (`~/Library/LaunchAgents/dev.dpatel7.shoo.plist`) and shows shoo's window at http://127.0.0.1:8689.

Tests: `node --test` (Node 18 or newer). No dependencies.
