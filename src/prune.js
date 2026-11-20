'use strict';
// Taking the ads out of YouTube's data.
//
// YouTube's pages and its player ask the server for JSON. Video ads arrive as
// "adPlacements"/"playerAds"/"adSlots" in the player's data, and the ads in
// the home feed, search, the "up next" list and Shorts arrive as their own
// items ("adSlotRenderer" and friends). Remove those and the player and the
// page simply have no ads to show. Everything else is left exactly as it was.

// Keys that are always ads, wherever they appear: delete the key.
const AD_KEYS = new Set([
  'adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams',
  'adSafetyReason', 'adInferredBlockingStatus',
  // the "Ad blockers violate YouTube's Terms of Service" pop-up
  'enforcementMessageViewModel',
]);

// Things that are an ad on their own: remove the whole item that holds one.
const AD_RENDERERS = new Set([
  'adSlotRenderer', 'displayAdRenderer', 'inFeedAdLayoutRenderer', 'promotedSparklesWebRenderer',
  'promotedSparklesTextSearchRenderer', 'searchPyvRenderer', 'promotedVideoRenderer',
  'compactPromotedVideoRenderer', 'compactPromotedItemRenderer', 'carouselAdRenderer',
  'mastheadAdV4Renderer', 'bannerPromoRenderer', 'statementBannerRenderer', 'actionCompanionAdRenderer',
  'playerLegacyDesktopWatchAdsRenderer', 'adActionInterstitialRenderer', 'brandVideoSingletonRenderer',
  'brandVideoShelfRenderer', 'videoMastheadAdV3Renderer', 'primetimePromoRenderer', 'shoppingOverlayRenderer',
]);

const MAX_DEPTH_FOR_ITEMS = 4;

/** Does this list item hold an ad (an ad renderer near its top, a Shorts ad, the ads panel)? */
function isAdItem(item, depth = 0) {
  if (!item || typeof item !== 'object' || depth > MAX_DEPTH_FOR_ITEMS) return false;
  if (Array.isArray(item)) return false;
  for (const [k, v] of Object.entries(item)) {
    if (AD_RENDERERS.has(k)) return true;
    // Shorts: an ad in the swipe-through list carries ad parameters
    if (k === 'adClientParams' || k === 'adVideoId') return true;
    // the "ads" side panel next to a video
    if (k === 'targetId' && v === 'engagement-panel-ads') return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && isAdItem(v, depth + 1)) return true;
  }
  return false;
}

/** Removes ads from parsed YouTube data, in place. Returns how many ads it took out. */
function prune(data) {
  let removed = 0;
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        if (isAdItem(node[i])) { node.splice(i, 1); removed++; } else walk(node[i]);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (AD_KEYS.has(key)) {
        const v = node[key];
        removed += key === 'adPlacements' && Array.isArray(v) ? Math.max(v.length, 1)
          : key === 'enforcementMessageViewModel' || key === 'adSafetyReason' || key === 'adInferredBlockingStatus' ? 0 : 1;
        delete node[key];
      } else if (AD_RENDERERS.has(key)) {
        delete node[key];
        removed++;
      } else {
        walk(node[key]);
      }
    }
  };
  walk(data);
  return removed;
}

/** For a JSON response body: the new body and how many ads were removed. */
function pruneJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { text, removed: 0 }; }
  const removed = prune(data);
  return { text: removed ? JSON.stringify(data) : text, removed };
}

// ── YouTube's HTML pages carry the same data inside <script> tags ─────────────

const ASSIGNMENTS = [
  /\b(?:var\s+)?ytInitialPlayerResponse\s*=\s*/g,
  /\b(?:var\s+)?ytInitialData\s*=\s*/g,
  /\bwindow\[\s*["']ytInitialData["']\s*\]\s*=\s*/g,
  /\bwindow\[\s*["']ytInitialPlayerResponse["']\s*\]\s*=\s*/g,
];

/** Where the JSON object starting at `from` ends (index after its last brace), or -1. */
function objectEnd(text, from) {
  if (text[from] !== '{') return -1;
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

// JSON put back into a <script> must not be able to close the tag.
const scriptSafe = (json) => json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** For an HTML page: the new page and how many ads were removed. */
function pruneHtml(html) {
  let removed = 0;
  let out = html;
  for (const re of ASSIGNMENTS) {
    re.lastIndex = 0;
    let m;
    const edits = [];
    while ((m = re.exec(out))) {
      const start = m.index + m[0].length;
      const end = objectEnd(out, start);
      if (end < 0) continue;
      let data;
      try { data = JSON.parse(out.slice(start, end)); } catch { continue; }
      const n = prune(data);
      if (n) { edits.push([start, end, scriptSafe(JSON.stringify(data))]); removed += n; }
      re.lastIndex = end;
    }
    for (const [s, e, text] of edits.reverse()) out = out.slice(0, s) + text + out.slice(e);
  }
  return { text: out, removed };
}

module.exports = { prune, pruneJson, pruneHtml, isAdItem, objectEnd, AD_KEYS, AD_RENDERERS };
