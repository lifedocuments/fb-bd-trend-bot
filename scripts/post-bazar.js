// Morning post: আজকের বাজারদর (Dhaka essential prices from TCB).
// Skips (with a Telegram note to the owner) whenever the report can't be
// read reliably — it never guesses a price.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findTcbReport, readPricesWithAI, validatePrices, bazarCaption, bnDate, bnNum, dhakaToday } from './lib/bazar.js';
import { makeEnabled, publishViaMake } from './lib/make.js';
import { postPhotoToPage } from './lib/facebook.js';
import { notify, postLink } from './lib/telegram.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(HERE, '..', 'data', 'posted.json');
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === 'true';
const PAGE_NAME = process.env.PAGE_NAME || 'Sakin Mart Bangladesh';
const BRAND = (process.env.BRAND_HASHTAG || '#SakinMartBD').startsWith('#') ? (process.env.BRAND_HASHTAG || '#SakinMartBD') : '#' + process.env.BRAND_HASHTAG;

async function loadLog() { try { return JSON.parse(await fs.readFile(LOG, 'utf8')); } catch { return []; } }
async function saveLog(v) { await fs.mkdir(path.dirname(LOG), { recursive: true }); await fs.writeFile(LOG, JSON.stringify(v, null, 2) + '\n'); }

function drawCard(payload) {
  return new Promise((resolve) => {
    const p = spawn('python3', [path.join(HERE, 'bazar-card.py')], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ code: -1, err: e.message }));
    p.on('close', (code) => resolve({ code, err }));
    p.stdin.end(JSON.stringify(payload));
  });
}

async function main() {
  if (String(process.env.BAZAR_MODE || 'daily').toLowerCase() === 'off') { console.log('[bazar] BAZAR_MODE=off — nothing to do.'); return; }
  const today = dhakaToday();
  const posted = await loadLog();
  const mine = posted.filter((p) => p.kind === 'bazar' && !p.skipped);
  if (mine.some((p) => dhakaToday(new Date(p.postedAt)) === today)) { console.log('[bazar] Already posted today.'); return; }
  const last = mine[mine.length - 1];

  let check;
  try {
    const url = await findTcbReport();
    console.log('[bazar] TCB report:', url);
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fb-bd-trend-bot/1.0)' } });
    if (!res.ok) throw new Error(`report download HTTP ${res.status}`);
    const pdf = Buffer.from(await res.arrayBuffer());
    if (pdf.length > 15 * 1024 * 1024 || pdf.subarray(0, 4).toString() !== '%PDF') throw new Error('downloaded file is not a normal PDF');
    const data = await readPricesWithAI(pdf);
    check = validatePrices(data, { today, lastPrices: last?.prices || null });
    if (check.ok && last?.reportDate === check.reportDate) check = { ok: false, reason: `TCB has not published a new report since ${check.reportDate} (holiday?)` };
  } catch (e) {
    check = { ok: false, reason: e.message };
  }
  if (!check.ok) {
    console.log('[bazar] Not posting today:', check.reason);
    await notify(`ℹ️ বাজারদর পোস্ট হয়নি: ${check.reason}`);
    return;
  }
  console.log(`[bazar] ${check.rows.length} items read for ${check.reportDate}.`);
  const caption = bazarCaption(check, { pageName: PAGE_NAME, brandHashtag: BRAND });
  console.log('[bazar] Caption:\n' + caption);
  if (DRY_RUN) { console.log('[bazar] DRY RUN — not posting.'); return; }

  const viaMake = makeEnabled();
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'bazar-'));
  const out = path.join(dir, viaMake ? 'bazar.jpg' : 'bazar.png');
  const hasTrend = check.rows.some((r) => r.trend === 'up' || r.trend === 'down');
  const { code, err } = await drawCard({
    out, title: 'আজকের বাজারদর', date_text: `ঢাকা · ${bnDate(check.reportDate)}`,
    rows: check.rows.map((r) => ({ name: r.bn, unit: r.unit, price: r.min === r.max ? `৳${bnNum(r.min)}` : `৳${bnNum(r.min)}–${bnNum(r.max)}`, trend: r.trend })),
    source: 'উৎস: টিসিবি (TCB) দৈনিক বাজারদর', note: hasTrend ? 'লাল তীর: বেড়েছে · সবুজ তীর: কমেছে (গত সপ্তাহের তুলনায়)' : '',
    page_name: PAGE_NAME, tag: BRAND
  });
  if (code !== 0) {
    console.log(`[bazar] Card could not be drawn (exit ${code}) ${err.slice(0, 200)} — not posting.`);
    await notify('ℹ️ বাজারদর পোস্ট হয়নি: ছবি তৈরি করা যায়নি।');
    return;
  }
  const pageId = process.env.FB_PAGE_ID;
  let result;
  if (viaMake) result = await publishViaMake({ caption, imagePath: out, comment: '' });
  else result = await postPhotoToPage({ pageId, filePath: out, caption, publish: true });
  const postId = result.post_id ? (String(result.post_id).includes('_') ? String(result.post_id) : `${pageId}_${result.post_id}`) : (result.id ? String(result.id) : '');
  console.log('[bazar] Published:', JSON.stringify(result));
  posted.push({ title: `বাজারদর ${check.reportDate}`, kind: 'bazar', category: 'bazar', postedAt: new Date().toISOString(), format: 'photo',
    ...(postId ? { postId } : {}), reportDate: check.reportDate, prices: Object.fromEntries(check.rows.map((r) => [r.key, { min: r.min, max: r.max }])) });
  await saveLog(posted);
  await notify(`✅ বাজারদর পোস্ট প্রকাশিত (${bnNum(check.rows.length)}টি পণ্য)\n${postLink({ format: 'photo', postId, pageId })}`);
}

main().catch(async (e) => {
  console.error('[bazar] Failed:', e.message);
  await notify(`⚠️ বাজারদর পোস্টে সমস্যা: ${e.message}`);
  process.exit(1);
});
