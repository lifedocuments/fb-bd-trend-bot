// Shared settings for breaking-trend posts (repository variables).
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
export function breakingOptions() {
  return {
    minTraffic: num(process.env.BREAKING_MIN_SEARCHES, 100000),
    maxPerDay: num(process.env.BREAKING_MAX_PER_DAY, 2),
    minGapMinutes: num(process.env.BREAKING_MIN_GAP_MINUTES, 60),
    maxAgeHours: num(process.env.BREAKING_MAX_AGE_HOURS, 6),
    maxSportsPerDay: num(process.env.MAX_SPORTS_PER_DAY, 1),
    maxPoliticsPerDay: num(process.env.MAX_POLITICS_PER_DAY, 1)
  };
}
