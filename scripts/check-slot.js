// First step of every workflow run: decides whether this run should post,
// and whether as a Reel. Writes post=true|false, reel=true|false and
// slot=<BD hour> to $GITHUB_OUTPUT. Makes today's plan on the first run of
// the day and saves it to data/schedule.json.
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEngagement } from './lib/facebook.js';
import { isPaused } from './lib/control.js';
import { slotFromCron, dhakaDate, slotStats, choosePlan, loadSchedule, saveSchedule } from './lib/schedule.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POSTED = path.join(HERE, '..', 'data', 'posted.json');
const on = (v, def) => (v === undefined || v === null || v === '') ? def : String(v).toLowerCase() !== 'false';

async function output(vals) {
  const lines = Object.entries(vals).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, lines);
  console.log('[check-slot] ' + lines.trim().replace(/\n/g, ', '));
}

async function main() {
  const event = process.env.EVENT_NAME || 'workflow_dispatch';
  const reelsOn = on(process.env.REELS, true);
  if (event !== 'schedule') {
    // Manual run: always post now; Reel only if the "reel" box was ticked.
    await output({ post: true, reel: reelsOn && String(process.env.INPUT_REEL) === 'true', slot: '' });
    return;
  }
  if (await isPaused()) {
    console.log('[check-slot] Bot is paused from Telegram (/resume to restart). Not posting.');
    await output({ post: false, reel: false, slot: '' });
    return;
  }
  const slot = slotFromCron(process.env.EVENT_SCHEDULE);
  if (!slot) { await output({ post: false, reel: false, slot: '' }); return; }

  const today = dhakaDate();
  let plan = await loadSchedule();
  if (!plan || plan.date !== today) {
    let posted = [];
    try { posted = JSON.parse(await readFile(POSTED, 'utf8')); } catch {}
    let engagement = {};
    const smart = on(process.env.SMART_TIMING, true);
    if (smart) {
      const recent = posted.filter((p) => p.postId && p.slot && p.format !== 'reel'
        && (Date.now() - new Date(p.postedAt)) < 31 * 864e5);
      try {
        engagement = await fetchEngagement(recent.map((p) => p.postId));
      } catch (e) {
        console.warn('[check-slot] Could not read post engagement, using default times today:', e.message);
      }
    }
    const stats = slotStats(posted, engagement);
    const chosen = choosePlan(stats, process.env.POSTS_PER_DAY || 3, smart);
    plan = { date: today, ...chosen, stats: stats.map(({ hour, n, avg }) => ({ hour, posts: n, avgScore: Math.round(avg * 10) / 10 })) };
    await saveSchedule(plan);
    console.log(`[check-slot] Today's plan (${plan.reason}): post at ${plan.slots.map((h) => h + ':00').join(', ')} BD time; Reel at ${plan.reelSlot}:00.`);
  }
  const post = plan.slots.includes(slot);
  await output({ post, reel: post && reelsOn && plan.reelSlot === slot, slot });
}

main().catch(async (err) => {
  // Never block posting because of the planner: fall back to fixed times.
  console.warn('[check-slot] Planner failed, using fixed times:', err.message);
  const slot = slotFromCron(process.env.EVENT_SCHEDULE);
  const post = process.env.EVENT_NAME !== 'schedule' || [9, 14, 21].includes(slot);
  await output({ post, reel: false, slot: slot || '' });
});
