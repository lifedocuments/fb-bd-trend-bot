// Merges two copies of the bot's data folder when two workflow runs saved at
// the same time. Usage: node scripts/merge-data.js <ours-dir> <theirs-dir>
// Result is written into <theirs-dir> (the up-to-date checkout).
//   posted.json   -> union of both logs (nothing lost), sorted by time
//   control.json  -> the copy that handled the newest Telegram message
//   schedule.json -> the copy for the latest day
//   learnings.json-> the newest
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_LOG_ENTRIES = 600;
const [ours, theirs] = process.argv.slice(2);

async function read(dir, f) {
  try { return JSON.parse(await readFile(path.join(dir, f), 'utf8')); } catch { return null; }
}
async function write(dir, f, v) {
  await writeFile(path.join(dir, f), JSON.stringify(v, null, 2) + '\n');
}
const when = (e) => Date.parse(e.postedAt || e.skippedAt || '') || 0;
const key = (e) => `${String(e.title || '').trim().toLowerCase()}|${e.postedAt || e.skippedAt || ''}|${e.postId || ''}`;

export function mergePosted(a = [], b = []) {
  const map = new Map();
  for (const e of [...(b || []), ...(a || [])]) map.set(key(e), e);
  return [...map.values()].sort((x, y) => when(x) - when(y)).slice(-MAX_LOG_ENTRIES);
}

async function main() {
  const o = {}, t = {};
  for (const f of ['posted.json', 'control.json', 'schedule.json', 'learnings.json']) {
    o[f] = await read(ours, f); t[f] = await read(theirs, f);
  }
  if (o['posted.json'] || t['posted.json']) await write(theirs, 'posted.json', mergePosted(o['posted.json'], t['posted.json']));
  if (o['control.json'] && (!t['control.json'] || (o['control.json'].lastUpdateId || 0) >= (t['control.json'].lastUpdateId || 0))) {
    await write(theirs, 'control.json', o['control.json']);
  }
  if (o['schedule.json'] && (!t['schedule.json'] || String(o['schedule.json'].date) >= String(t['schedule.json'].date))) {
    await write(theirs, 'schedule.json', o['schedule.json']);
  }
  if (o['learnings.json'] && (!t['learnings.json'] || String(o['learnings.json'].updatedAt) >= String(t['learnings.json'].updatedAt))) {
    await write(theirs, 'learnings.json', o['learnings.json']);
  }
  console.log('[merge-data] Merged data from two runs.');
}

if (process.argv[1] && process.argv[1].endsWith('merge-data.js')) {
  main().catch((e) => { console.error('[merge-data] FAILED:', e.message); process.exitCode = 1; });
}
