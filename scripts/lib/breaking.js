// Breaking-trend detection: a topic that suddenly reaches a lot of searches
// in Bangladesh gets posted right away instead of waiting for the next slot.
import { guessCategory, dhakaDay } from './variety.js';

export function parseTraffic(s) {
  const m = String(s || '').replace(/,/g, '').match(/([\d.]+)\s*([KkMm])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (/k/i.test(m[2] || '')) n *= 1e3;
  if (/m/i.test(m[2] || '')) n *= 1e6;
  return Math.round(n);
}

const norm = (t) => String(t || '').trim().toLowerCase();

// trends: safe Google Trends items; posted: data/posted.json entries.
// Returns { candidates: [...trend, category, trafficNum], reason }.
export function findBreaking(trends, posted, {
  minTraffic = 100000, maxPerDay = 2, minGapMinutes = 60, maxAgeHours = 6, maxSportsPerDay = 1, now = new Date()
} = {}) {
  const seen = new Set(posted.filter((p) => !p.dryRun).map((p) => norm(p.title)));
  const today = dhakaDay(now);
  const real = posted.filter((p) => !p.skipped && !p.dryRun && p.postedAt && !Number.isNaN(Date.parse(p.postedAt)));
  const todays = real.filter((p) => dhakaDay(p.postedAt) === today);
  const breakingToday = todays.filter((p) => p.breaking).length;
  if (breakingToday >= maxPerDay) return { candidates: [], reason: `already ${breakingToday} breaking post(s) today (limit ${maxPerDay})` };
  const last = real.reduce((m, p) => Math.max(m, Date.parse(p.postedAt)), 0);
  if (last && (now - last) < minGapMinutes * 60000) {
    return { candidates: [], reason: `last post was only ${Math.round((now - last) / 60000)} min ago (need ${minGapMinutes})` };
  }
  const sportsToday = todays.filter((p) => p.category === 'sports').length;
  const candidates = trends
    .map((t) => ({ ...t, trafficNum: parseTraffic(t.traffic), category: t.category || guessCategory(`${t.title} ${t.context}`) }))
    .filter((t) => t.trafficNum >= minTraffic)
    .filter((t) => !seen.has(norm(t.title)))
    .filter((t) => !t.pubDate || Number.isNaN(Date.parse(t.pubDate)) || (now - Date.parse(t.pubDate)) <= maxAgeHours * 3600000)
    .filter((t) => !(t.category === 'sports' && sportsToday >= maxSportsPerDay))
    .sort((a, b) => b.trafficNum - a.trafficNum);
  return { candidates, reason: candidates.length ? '' : `no new topic at ${minTraffic.toLocaleString('en')}+ searches right now` };
}
