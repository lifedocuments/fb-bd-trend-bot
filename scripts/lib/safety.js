// A cheap first line of defense before a trend ever reaches Claude or gets
// anywhere near the Page: skip anything that looks like a tragedy, disaster,
// crime, or political flashpoint. A Facebook Page posting cheerful "trending
// now!" content about a death or a disaster reads as tone-deaf at best, so
// this errs heavily on the side of skipping rather than posting.
//
// This is NOT a substitute for human spot-checks, especially early on — it's
// a blunt keyword filter, not real understanding. The system prompt given to
// Claude (see claude.js) also asks it to independently refuse sensitive
// topics, as a second layer.

const BLOCKED_PATTERNS = [
  // English
  /\bdeath\b/i, /\bdied\b/i, /\bdies\b/i, /\bkilled\b/i, /\bkilling\b/i,
  /\bmurder/i, /\bsuicide/i, /\baccident\b/i, /\bcrash\b/i, /\bfire\b/i,
  /\bflood/i, /\bcyclone/i, /\bearthquake/i, /\battack/i, /\bbomb/i,
  /\bshooting/i, /\briot/i, /\bprotest/i, /\bviolence/i, /\brape\b/i,
  /\bwar\b/i, /\bmissing\b/i, /\bdrown/i,
  // Bangla
  /নিহত/, /মৃত্যু/, /মারা\s*গেছে/, /খুন/, /আত্মহত্যা/, /দুর্ঘটনা/,
  /অগ্নিকাণ্ড/, /বন্যা/, /ঘূর্ণিঝড়/, /ভূমিকম্প/, /হামলা/, /বোমা/,
  /গুলি/, /দাঙ্গা/, /বিক্ষোভ/, /ধর্ষণ/, /নিখোঁজ/
];

export function isSensitiveTopic(text) {
  return BLOCKED_PATTERNS.some((re) => re.test(text));
}

export function filterSafeTrends(trends) {
  return trends.filter((t) => {
    const haystack = `${t.title} ${t.context}`;
    return !isSensitiveTopic(haystack);
  });
}
