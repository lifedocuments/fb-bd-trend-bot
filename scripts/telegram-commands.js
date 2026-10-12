// Reads new Telegram messages sent to your bot and acts on them. Runs at the
// start of the hourly and scheduled workflow runs, so commands are picked up
// within about an hour. Only messages from TELEGRAM_CHAT_ID are obeyed.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { telegramOn, getUpdates, notify, postLink } from './lib/telegram.js';
import { loadControl, saveControl } from './lib/control.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data');
const REPORT = path.join(HERE, '..', 'reports', 'latest.md');

const HELP = [
  'সাকিন মার্ট বট — কমান্ড:',
  '/status — আজকের অবস্থা ও শেষ পোস্ট',
  '/pause — নির্ধারিত ও ব্রেকিং পোস্ট বন্ধ',
  '/resume — আবার চালু',
  '/postnow — এখনই একটি পোস্ট',
  '/reel — এখনই একটি রিল',
  '/report — সাপ্তাহিক শেখা রিপোর্ট',
  '',
  'Commands are picked up within about an hour (08:30–23:30 BD).'
].join('\n');

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(path.join(DATA, file), 'utf8')); } catch { return fallback; }
}

async function dispatchPost(reel) {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY / GITHUB_TOKEN not available');
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/post.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME || 'main', inputs: { dry_run: false, reel } })
  });
  if (res.status !== 204) throw new Error(`GitHub returned HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 150)}`);
}

function ago(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} মিনিট আগে` : m < 1440 ? `${Math.round(m / 60)} ঘণ্টা আগে` : `${Math.round(m / 1440)} দিন আগে`;
}

async function statusText(control) {
  const posted = await readJson('posted.json', []);
  const plan = await readJson('schedule.json', null);
  const live = posted.filter((p) => !p.skipped && !p.dryRun && p.postedAt);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  const todays = live.filter((p) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(p.postedAt)) === today);
  const last = live.at(-1);
  const lines = [
    control.paused ? '⏸ বট এখন বন্ধ (paused). চালু করতে /resume' : '▶️ বট চালু আছে',
    `আজ পোস্ট: ${todays.length}${todays.some((p) => p.breaking) ? ` (ব্রেকিং ${todays.filter((p) => p.breaking).length})` : ''}`,
    plan?.date === today ? `আজকের সময়: ${plan.slots.map((h) => h + ':00').join(', ')} · রিল ${plan.reelSlot}:00` : 'আজকের সময়সূচি এখনো তৈরি হয়নি',
  ];
  if (last) {
    lines.push(`শেষ পোস্ট: ${ago(last.postedAt)} — ${last.headline || last.title} [${last.category || '?'} · ${last.format || 'photo'}]`);
    const link = postLink({ format: last.format, postId: last.postId, videoId: last.videoId });
    if (link) lines.push(link);
  }
  return lines.join('\n');
}

async function handle(cmd, control) {
  switch (cmd) {
    case '/start': case '/help': return HELP;
    case '/status': return statusText(control);
    case '/pause':
      control.paused = true; control.pausedAt = new Date().toISOString();
      return '⏸ বট বন্ধ করা হলো। নির্ধারিত ও ব্রেকিং পোস্ট হবে না। চালু করতে /resume';
    case '/resume':
      control.paused = false; delete control.pausedAt;
      return '▶️ বট আবার চালু। পরের নির্ধারিত সময়ে পোস্ট হবে।';
    case '/postnow': case '/reel': {
      // Guard against double-starts (double tap, or the same command seen twice).
      const lastAt = Date.parse(control.lastDispatchAt || '') || 0;
      const gapMin = Number(process.env.DISPATCH_GUARD_MINUTES || 10);
      if (Date.now() - lastAt < gapMin * 60000) {
        return `⏳ একটি পোস্ট ইতিমধ্যে শুরু হয়েছে (${Math.round((Date.now() - lastAt) / 60000)} মিনিট আগে)। আবার পোস্ট করতে ${gapMin} মিনিট পর চেষ্টা করুন।`;
      }
      try {
        await dispatchPost(cmd === '/reel');
        control.lastDispatchAt = new Date().toISOString();
        return cmd === '/reel' ? '🎬 রিল তৈরি শুরু হয়েছে — কয়েক মিনিটে পোস্ট হবে।' : '🚀 পোস্ট তৈরি শুরু হয়েছে — কয়েক মিনিটে পোস্ট হবে।';
      } catch (e) {
        return `❌ শুরু করা গেল না: ${e.message}`;
      }
    }
    case '/report':
      try {
        const md = await readFile(REPORT, 'utf8');
        return md.replace(/[#*|`]/g, '').replace(/\n{3,}/g, '\n\n').slice(0, 3500);
      } catch {
        return 'এখনো কোনো রিপোর্ট নেই। প্রথম সাপ্তাহিক রিপোর্ট রবিবার রাতে তৈরি হবে।';
      }
    default: return `বুঝতে পারিনি। ${HELP}`;
  }
}

async function main() {
  if (!telegramOn()) { console.log('[telegram] Not configured — skipping commands.'); return; }
  const control = await loadControl();
  const handledUpTo = control.lastUpdateId || 0;
  const updates = (await getUpdates(handledUpTo + 1)).filter((u) => u.update_id > handledUpTo);
  if (updates.length) {
    // Tell Telegram these are handled now, so they are never delivered
    // again even if saving data/control.json fails later in this run.
    const maxId = Math.max(...updates.map((u) => u.update_id));
    control.lastUpdateId = Math.max(control.lastUpdateId || 0, maxId);
    try { await getUpdates(maxId + 1); } catch (e) { console.warn('[telegram] Could not confirm updates:', e.message); }
    await saveControl(control);
  }
  for (const u of updates) {
    control.lastUpdateId = Math.max(control.lastUpdateId || 0, u.update_id);
    const msg = u.message;
    if (!msg?.text) continue;
    if (String(msg.chat?.id) !== String(process.env.TELEGRAM_CHAT_ID)) {
      console.log(`[telegram] Ignoring message from another chat (${msg.chat?.id}).`);
      continue;
    }
    // Ignore commands older than 12h (e.g. sent overnight then forgotten).
    if (msg.date && Date.now() / 1000 - msg.date > 12 * 3600) { console.log('[telegram] Ignoring old command:', msg.text); continue; }
    const cmd = msg.text.trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
    console.log(`[telegram] Command: ${cmd}`);
    const reply = await handle(cmd, control);
    await notify(reply);
  }
  await saveControl(control);
}

main().catch((e) => console.warn('[telegram] Command check failed (posting continues):', e.message));
