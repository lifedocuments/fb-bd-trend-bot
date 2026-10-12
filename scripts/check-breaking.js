// Hourly, cheap first step of the breaking-trend workflow: no AI, no
// Facebook calls. Writes found=true|false to $GITHUB_OUTPUT so the heavier
// steps only run when there's something worth posting.
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBdTrends } from './lib/trends.js';
import { filterSafeTrends } from './lib/safety.js';
import { findBreaking } from './lib/breaking.js';
import { breakingOptions } from './lib/breaking-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
async function out(found) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `found=${found}\n`);
}
async function main() {
  if (String(process.env.BREAKING_POSTS).toLowerCase() === 'false') { console.log('[breaking] Turned off (BREAKING_POSTS=false).'); return out(false); }
  let posted = [];
  try { posted = JSON.parse(await readFile(path.join(HERE, '..', 'data', 'posted.json'), 'utf8')); } catch {}
  const trends = filterSafeTrends(await fetchBdTrends());
  const { candidates, reason } = findBreaking(trends, posted, breakingOptions());
  if (!candidates.length) { console.log(`[breaking] Nothing to post: ${reason}.`); return out(false); }
  console.log(`[breaking] Found: ${candidates.slice(0, 3).map((c) => `"${c.title}" (${c.traffic}, ${c.category})`).join(', ')}`);
  return out(true);
}
main().catch(async (e) => { console.warn('[breaking] Check failed:', e.message); await out(false); });
