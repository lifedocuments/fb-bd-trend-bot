// Picks an image for a trend post.
//
// Default: Unsplash only (free to use). Google Trends' own suggested
// picture is usually a news publisher's photo, and reposting that on a
// business Page risks copyright complaints, so it is NOT used unless you set
// the repo variable ALLOW_TREND_PICTURES=true.
//
// Unsplash's API terms ask apps to credit the photographer and to ping the
// photo's download endpoint when a photo is used; both are done here.
// Returns { url, credit } or null (caller then posts text-only).

async function searchUnsplash(query) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
  if (!res.ok) {
    console.warn(`[image] Unsplash search returned HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  const photo = (data.results || [])[0];
  if (!photo?.urls?.regular) return null;

  // Required by Unsplash's API guidelines when a photo is actually used.
  if (photo.links?.download_location) {
    fetch(photo.links.download_location, { headers: { Authorization: `Client-ID ${key}` } }).catch(() => {});
  }
  const name = photo.user?.name || 'Unsplash photographer';
  return { url: photo.urls.regular, credit: `📷 ${name} / Unsplash` };
}

export async function pickImageForTrend(trend, imageQuery) {
  if (String(process.env.ALLOW_TREND_PICTURES).toLowerCase() === 'true'
      && /^https?:\/\//.test(trend.picture || '')) {
    return { url: trend.picture, credit: '' };
  }
  const queries = [...new Set([imageQuery, 'Bangladesh'].filter(Boolean))];
  for (const query of queries) {
    try {
      const found = await searchUnsplash(query);
      if (found) return found;
    } catch (e) {
      console.warn(`[image] Unsplash search for "${query}" failed:`, e.message);
    }
  }
  return null;
}
