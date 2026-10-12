// Smart timing. The workflow wakes up at 6 candidate times a day; each day
// the bot picks which of them to actually post in, based on how earlier posts
// in each slot performed (reactions + 2x comments + 3x shares). It keeps the
// best slots and always tries one other slot, so it keeps learning.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEDULE_PATH = path.join(HERE, '..', '..', 'data', 'schedule.json');

// Bangladesh hours. Cron (UTC) = BD hour - 6. Keep in sync with post.yml.
export const SLOTS = [9, 12, 14, 17, 19, 21];
export const DEFAULT_ORDER = [9, 14, 21, 12, 19, 17];
const MIN_SAMPLES = 2;
const WINDOW_DAYS = 30;
const MIN_AGE_HOURS = 20;

export function slotFromCron(cron) {
  const m = String(cron || '').trim().match(/^\d+\s+(\d+)\s/);
  if (!m) return null;
  const bd = (Number(m[1]) + 6) % 24;
  return SLOTS.includes(bd) ? bd : null;
}

export function dhakaDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(d);
}

export function scorePost(e) {
  return (e.reactions || 0) + 2 * (e.comments || 0) + 3 * (e.shares || 0);
}

// posted: entries from data/posted.json; engagement: { [postId]: {...} }
export function slotStats(posted, engagement, now = new Date()) {
  const stats = Object.fromEntries(SLOTS.map((h) => [h, { hour: h, n: 0, total: 0, last: 0 }]));
  for (const p of posted) {
    if (!p.postId || !p.slot || !stats[p.slot] || p.format === 'reel') continue;
    const age = (now - new Date(p.postedAt)) / 3600000;
    if (age < MIN_AGE_HOURS || age > WINDOW_DAYS * 24) continue;
    const e = engagement[p.postId];
    if (!e) continue;
    const s = stats[p.slot];
    s.n += 1; s.total += scorePost(e); s.last = Math.max(s.last, new Date(p.postedAt).getTime());
  }
  return SLOTS.map((h) => ({ ...stats[h], avg: stats[h].n ? stats[h].total / stats[h].n : 0 }));
}

export function choosePlan(stats, postsPerDay = 3, smart = true) {
  const N = Math.max(1, Math.min(SLOTS.length, Number(postsPerDay) || 3));
  const rank = (h) => DEFAULT_ORDER.indexOf(h);
  if (!smart) {
    const slots = DEFAULT_ORDER.slice(0, N).sort((a, b) => a - b);
    return { slots, reelSlot: slots.includes(21) ? 21 : slots[slots.length - 1], reason: 'fixed times (SMART_TIMING=false)' };
  }
  const unexplored = stats.filter((s) => s.n < MIN_SAMPLES).sort((a, b) => a.n - b.n || rank(a.hour) - rank(b.hour));
  const known = stats.filter((s) => s.n >= MIN_SAMPLES).sort((a, b) => b.avg - a.avg || rank(a.hour) - rank(b.hour));
  const picks = [];
  const add = (s) => { if (s && picks.length < N && !picks.includes(s.hour)) picks.push(s.hour); };
  let reason;
  if (unexplored.length) {
    known.slice(0, N - 1).forEach(add);
    unexplored.forEach(add);
    known.forEach(add);
    reason = known.length ? 'best slots so far + testing new ones' : 'collecting data (trying every slot)';
  } else {
    known.slice(0, N - 1).forEach(add);
    // one "refresh" slot: the remaining slot with the oldest data
    known.slice(N - 1).sort((a, b) => a.last - b.last).forEach(add);
    reason = 'best slots + 1 refresh slot';
  }
  const bestKnown = known.find((s) => picks.includes(s.hour));
  const reelSlot = bestKnown ? bestKnown.hour : (picks.includes(21) ? 21 : picks[picks.length - 1]);
  return { slots: picks.sort((a, b) => a - b), reelSlot, reason };
}

export async function loadSchedule() {
  try { return JSON.parse(await readFile(SCHEDULE_PATH, 'utf8')); } catch { return null; }
}
export async function saveSchedule(s) {
  await writeFile(SCHEDULE_PATH, JSON.stringify(s, null, 2) + '\n');
}
