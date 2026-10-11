// Fetches Google Trends' "daily trending searches" RSS feed for Bangladesh
// and returns a clean list of { title, traffic, picture, newsUrl } entries.
//
// This feed has no official API docs and no auth — it's the same public
// endpoint the old Google Trends homepage widget used. The format has been
// stable for years (RSS 2.0 with a custom "ht:" namespace for extra fields),
// but since it's undocumented, this parser is deliberately tolerant: missing
// fields just come back empty instead of throwing, so a format tweak on
// Google's side degrades gracefully (you fall back to text-only posts)
// instead of breaking the whole workflow run.

// Google moved the public feed to /trending/rss; the old /trends/trendingsearches
// address is kept only as a fallback. Set TRENDS_FEED_URL to override both.
const FEED_URLS = process.env.TRENDS_FEED_URL
  ? [process.env.TRENDS_FEED_URL]
  : [
      'https://trends.google.com/trending/rss?geo=BD',
      'https://trends.google.com/trends/trendingsearches/daily/rss?geo=BD'
    ];

function extractAll(xml, tag) {
  // Matches both "<tag>...</tag>" and namespaced "<ht:tag>...</ht:tag>".
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(decodeXmlEntities(m[1].trim()));
  return out;
}

function decodeXmlEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Splits the raw feed into per-<item> chunks so fields from one trend never
// leak into another.
function splitItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) items.push(m[1]);
  return items;
}

async function fetchFeedXml() {
  const errors = [];
  for (const url of FEED_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fb-bd-trend-bot/1.0)' }
      });
      if (!res.ok) { errors.push(`${url} -> HTTP ${res.status}`); continue; }
      const xml = await res.text();
      if (!/<item>/.test(xml)) { errors.push(`${url} -> no <item> entries`); continue; }
      console.log(`[trends] Using feed: ${url}`);
      return xml;
    } catch (err) {
      errors.push(`${url} -> ${err.message}`);
    }
  }
  throw new Error('Could not load the Google Trends BD feed. Tried: ' + errors.join(' | '));
}

export async function fetchBdTrends() {
  const xml = await fetchFeedXml();
  const itemChunks = splitItems(xml);

  const trends = itemChunks.map((chunk) => {
    const title = extractAll(chunk, 'title')[0] || '';
    const traffic = extractAll(chunk, 'approx_traffic')[0] || '';
    const picture = extractAll(chunk, 'picture')[0] || '';
    const newsTitles = extractAll(chunk, 'news_item_title');
    const newsUrls = extractAll(chunk, 'news_item_url');
    return {
      title,
      traffic,
      picture,
      context: newsTitles.slice(0, 3).join(' | '),
      newsUrl: newsUrls[0] || ''
    };
  }).filter((t) => t.title);

  return trends;
}
