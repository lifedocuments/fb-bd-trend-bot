// Picks an image for a trend post. Prefers the picture Google Trends itself
// associates with the trend (when present — often a relevant news photo),
// and falls back to an Unsplash search on the trend title. Returns null if
// neither works, so the caller can fall back to a text-only post rather than
// failing the whole run.

async function searchUnsplash(query) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.results || [];
  if (!results.length) return null;
  // Take the first result — Unsplash already ranks by relevance.
  return results[0].urls?.regular || null;
}

export async function pickImageForTrend(trend) {
  if (trend.picture) {
    // Google's own suggested image for this trend. Sanity-check it actually
    // looks like an image URL before trusting it.
    if (/^https?:\/\//.test(trend.picture)) return trend.picture;
  }
  try {
    const fromUnsplash = await searchUnsplash(trend.title);
    if (fromUnsplash) return fromUnsplash;
  } catch (e) {
    console.warn('Unsplash search failed:', e.message);
  }
  // Last resort: a generic Bangladesh-flavoured query, so posts aren't
  // text-only just because the specific trend had no good image match.
  try {
    return await searchUnsplash('Bangladesh');
  } catch (e) {
    console.warn('Unsplash fallback search failed:', e.message);
    return null;
  }
}
