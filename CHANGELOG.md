# Changelog

## 1.2.0
- **Works on a Mac a school manages.** shoo's browser way changes nothing on the Mac, so it now runs there too: it blocks ads and YouTube's ads in Chrome opened through shoo, and the school's settings, filters and rules stay exactly as they are. Blocking ads in every app stays off on a managed Mac.
- If the school controls a browser's network settings, shoo leaves that browser alone.
- If the network checks secure connections (some schools do), YouTube keeps going through that check. If shoo can't check YouTube's certificate, it steps aside and YouTube works normally, ads included.

## 1.1.0
- **No administrator needed.** shoo now blocks ads in Chrome, Edge or Brave opened through shoo: website ads, Google's full-page ads, trackers and YouTube's ads. The first time, macOS may ask for your own Mac password (to trust the YouTube-only certificate). Blocking ads in every app and Safari is still there, for when an administrator approves it.
- New apps in your Applications folder: **shoo** opens the dashboard (find it with Spotlight or Launchpad), and **Chrome with shoo** (or Edge, or Brave) opens your browser with ad blocking. Keep it in your Dock.
- If Chrome is already open without shoo, shoo offers to close it and open it again with your tabs.
- The dashboard counts the website ads and trackers stopped today, too.
- A new scene behind the dashboard: Bramble's hedgerow, a bramble hedge with blackberries by a meadow, with bees, dandelion seeds in the wind, and fireflies and moths at night.

## 1.0.0
- First version: blocks ads on your whole Mac. Google's full-page ads, banners, pop-ups and trackers are blocked for every browser and app, and YouTube's video, feed, search and Shorts ads are taken out of its pages.
- Bramble the hedgehog lives in a pixel forest behind shoo's window: day in light mode, night in dark mode.
- Safe by design: it asks an administrator first, won't change a Mac a school manages, won't go around an existing filter, and `shoo off` puts everything back.
