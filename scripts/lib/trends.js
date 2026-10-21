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
    const newsSources = extractAll(chunk, 'news_item_source');
    return {
      title,
      traffic,
      picture,
      context: newsTitles.slice(0, 3).join(' | '),
      newsUrl: newsUrls[0] || '',
      newsTitle: newsTitles[0] || '',
      newsSource: newsSources[0] || '',
      pubDate: extractAll(chunk, 'pubDate')[0] || ''
    };
  }).filter((t) => t.title);

  return trends;
}

// Extra, non-sports topics: Google News Bangladesh section feeds (Bangla).
// These give the Page entertainment / tech / business stories so it isn't
// all cricket. Each item already knows its category.
const NEWS_SECTIONS = {
  ENTERTAINMENT: 'entertainment',
  TECHNOLOGY: 'tech',
  BUSINESS: 'business',
  SCIENCE: 'tech',
  WORLD: 'news',
  NATION: 'news'
};

// Category searches on Google News Bangladesh (Bangla + English). Each item
// already knows its category, like the section feeds below.
export const CATEGORY_SEARCHES = {
  fintech: [
    ['বাংলা কিউআর', 'bn'], ['মোবাইল ব্যাংকিং', 'bn'], ['ডিজিটাল ব্যাংক', 'bn'], ['ডিজিটাল পেমেন্ট', 'bn'],
    ['বিকাশ নগদ', 'bn'], ['ওয়ালেট লেনদেন', 'bn'], ['digital bank Bangladesh', 'en'], ['MFS Bangladesh', 'en']
  ],
  showbiz: [
    ['সিনেমা', 'bn'], ['চলচ্চিত্র', 'bn'], ['নায়িকা', 'bn'], ['নায়ক', 'bn'], ['অভিনেত্রী', 'bn'], ['ঢালিউড', 'bn']
  ],
  politics: [
    ['রাজনীতি', 'bn'], ['সরকার সিদ্ধান্ত', 'bn'], ['নির্বাচন কমিশন', 'bn']
  ]
};

export async function fetchCategoryNews(categories, { maxAgeHours = 24, perQuery = 2, perCategory = 4 } = {}) {
  const out = [];
  const seen = new Set();
  for (const cat of categories) {
    const queries = CATEGORY_SEARCHES[cat];
    if (!queries) continue;
    let got = 0;
    for (const [q, lang] of queries) {
      if (got >= perCategory) break;
      const loc = lang === 'en' ? 'hl=en-BD&gl=BD&ceid=BD:en' : 'hl=bn&gl=BD&ceid=BD:bn';
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:1d')}&${loc}`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fb-bd-trend-bot/1.0)' } });
        if (!res.ok) { console.warn(`[trends] Google News search "${q}" returned HTTP ${res.status}`); continue; }
        const xml = await res.text();
        let n = 0;
        for (const chunk of splitItems(xml)) {
          if (n >= perQuery || got >= perCategory) break;
          const raw = extractAll(chunk, 'title')[0] || '';
          const link = extractAll(chunk, 'link')[0] || '';
          const source = (chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '';
          const pub = extractAll(chunk, 'pubDate')[0] || '';
          if (pub && Date.now() - new Date(pub).getTime() > maxAgeHours * 3600000) continue;
          const src = decodeXmlEntities(source.trim());
          const headline = src && raw.endsWith(' - ' + src) ? raw.slice(0, -(src.length + 3)).trim() : raw.replace(/\s+-\s+[^-]+$/, '').trim();
          const key = headline.toLowerCase().replace(/\s+/g, ' ');
          if (!headline || seen.has(key)) continue;
          seen.add(key);
          out.push({ title: headline, traffic: '', picture: '', context: headline, newsUrl: link, newsTitle: headline, newsSource: src, category: cat, origin: 'news' });
          n++; got++;
        }
      } catch (e) {
        console.warn(`[trends] Could not search Google News for "${q}": ${e.message}`);
      }
    }
  }
  return out;
}

export async function fetchTopicNews(sections, { maxAgeHours = 24, perSection = 4 } = {}) {
  const out = [];
  for (const sec of sections) {
    const category = NEWS_SECTIONS[sec];
    if (!category) continue;
    const url = `https://news.google.com/rss/headlines/section/topic/${sec}?hl=bn&gl=BD&ceid=BD:bn`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fb-bd-trend-bot/1.0)' } });
      if (!res.ok) { console.warn(`[trends] Google News ${sec} returned HTTP ${res.status}`); continue; }
      const xml = await res.text();
      let n = 0;
      for (const chunk of splitItems(xml)) {
        if (n >= perSection) break;
        const raw = extractAll(chunk, 'title')[0] || '';
        const link = extractAll(chunk, 'link')[0] || '';
        const source = (chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '';
        const pub = extractAll(chunk, 'pubDate')[0] || '';
        if (pub && Date.now() - new Date(pub).getTime() > maxAgeHours * 3600000) continue;
        const src = decodeXmlEntities(source.trim());
        const headline = src && raw.endsWith(' - ' + src) ? raw.slice(0, -(src.length + 3)).trim() : raw.replace(/\s+-\s+[^-]+$/, '').trim();
        if (!headline) continue;
        out.push({
          title: headline, traffic: '', picture: '', context: headline,
          newsUrl: link, newsTitle: headline, newsSource: src,
          category, origin: 'news'
        });
        n++;
      }
    } catch (e) {
      console.warn(`[trends] Could not load Google News ${sec}: ${e.message}`);
    }
  }
  return out;
}
