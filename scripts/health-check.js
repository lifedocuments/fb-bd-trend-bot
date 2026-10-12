// Weekly health check. Fails the workflow run (so GitHub emails you) if the
// Facebook token stopped working or posts stopped going out. Also writes a
// short weekly summary to the run's Summary page.
import { readFile, appendFile } from 'node:fs/promises';
import { notify } from './lib/telegram.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POSTED = path.join(HERE, '..', 'data', 'posted.json');
const GRAPH = 'https://graph.facebook.com/v21.0';
const MIN_POSTS_PER_WEEK = Number(process.env.HEALTH_MIN_POSTS || 7);
const MAX_HOURS_SINCE_POST = Number(process.env.HEALTH_MAX_HOURS || 36);

const results = []; // { name, status: 'ok'|'warn'|'fail', detail }
const add = (name, status, detail) => { results.push({ name, status, detail }); console.log(`[health] ${status.toUpperCase().padEnd(4)} ${name}: ${detail}`); };

async function checkFacebook() {
  const pageId = process.env.FB_PAGE_ID, token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) return add('Facebook token', 'fail', 'FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN secret is missing.');
  try {
    const res = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const msg = data.error?.message || `HTTP ${res.status}`;
      const hint = /expired|session|password|invalid|190/i.test(msg + (data.error?.code || ''))
        ? ' The token no longer works (expired, password changed, or app removed) — make a new Page token and update the FB_PAGE_ACCESS_TOKEN secret.' : '';
      return add('Facebook token', 'fail', msg + hint);
    }
    if (String(data.id) !== String(pageId)) {
      return add('Facebook token', 'fail', `Token belongs to "${data.name}" (${data.id}), not FB_PAGE_ID ${pageId}. It may be a user token instead of the Page token.`);
    }
    add('Facebook token', 'ok', `Works for "${data.name}".`);
  } catch (e) {
    add('Facebook token', 'warn', `Could not reach Facebook: ${e.message}`);
  }
}

async function checkPosting() {
  let posted = [];
  try { posted = JSON.parse(await readFile(POSTED, 'utf8')); } catch { /* empty log */ }
  const now = Date.now();
  const live = posted.filter((p) => !p.skipped && !p.dryRun && p.postedAt && !Number.isNaN(Date.parse(p.postedAt)));
  const week = live.filter((p) => now - Date.parse(p.postedAt) <= 7 * 864e5);
  const last = live.reduce((m, p) => Math.max(m, Date.parse(p.postedAt)), 0);
  const hours = last ? (now - last) / 36e5 : Infinity;

  if (!last) add('Recent posting', 'fail', 'No posts recorded yet.');
  else if (hours > MAX_HOURS_SINCE_POST) add('Recent posting', 'fail', `Last post was ${Math.round(hours)} hours ago (limit ${MAX_HOURS_SINCE_POST}h). Check the latest "Post a BD trend" runs for errors.`);
  else add('Recent posting', 'ok', `Last post ${Math.round(hours)} hours ago.`);

  if (week.length >= MIN_POSTS_PER_WEEK) add('Posts this week', 'ok', `${week.length} posts in the last 7 days.`);
  else add('Posts this week', week.length ? 'warn' : 'fail', `Only ${week.length} posts in the last 7 days (expected at least ${MIN_POSTS_PER_WEEK}).`);

  const by = (key, fallback) => week.reduce((acc, p) => { const k = p[key] || fallback; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const skippedWeek = posted.filter((p) => p.skipped && p.skippedAt && now - Date.parse(p.skippedAt) <= 7 * 864e5).length;
  return { total: week.length, categories: by('category', 'unknown'), formats: by('format', 'photo'), skipped: skippedWeek };
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    if (process.env.ANTHROPIC_API_KEY) return add('AI key', 'ok', 'Using Claude (ANTHROPIC_API_KEY set; not checked).');
    return add('AI key', 'fail', 'GEMINI_API_KEY secret is missing.');
  }
  try {
    // Listing models checks the key without using any writing quota.
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key } });
    if (res.ok) return add('Gemini key', 'ok', 'Key accepted.');
    const body = await res.text().catch(() => '');
    if (res.status === 429) return add('Gemini key', 'warn', 'Rate-limited right now (free-tier limit); key itself looks fine.');
    add('Gemini key', 'fail', `HTTP ${res.status}: ${body.slice(0, 160)} — create a new key at aistudio.google.com/apikey and update GEMINI_API_KEY.`);
  } catch (e) {
    add('Gemini key', 'warn', `Could not reach Google: ${e.message}`);
  }
}

async function checkUnsplash() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return add('Unsplash key', 'warn', 'UNSPLASH_ACCESS_KEY missing — posts will use the plain card design without photos.');
  try {
    const res = await fetch('https://api.unsplash.com/search/photos?query=Bangladesh&per_page=1', { headers: { Authorization: `Client-ID ${key}` } });
    if (res.ok) return add('Unsplash key', 'ok', 'Key accepted.');
    add('Unsplash key', res.status === 403 ? 'warn' : 'warn', `HTTP ${res.status} — posts still go out, but without photos. Check the key at unsplash.com/oauth/applications.`);
  } catch (e) {
    add('Unsplash key', 'warn', `Could not reach Unsplash: ${e.message}`);
  }
}

function summaryMarkdown(week) {
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' };
  const lines = ['## Weekly health check', '', '| Check | Status | Details |', '|---|---|---|'];
  for (const r of results) lines.push(`| ${r.name} | ${icon[r.status]} | ${r.detail.replace(/\|/g, '/')} |`);
  if (week) {
    const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
    lines.push('', '### Last 7 days', '', `- Posts: **${week.total}**`, `- By category: ${fmt(week.categories)}`, `- By format: ${fmt(week.formats)}`, `- Topics skipped by the filters: ${week.skipped}`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  await checkFacebook();
  const week = await checkPosting();
  await checkGemini();
  await checkUnsplash();
  const md = summaryMarkdown(week);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
  const failed = results.filter((r) => r.status === 'fail');
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' };
  await notify([
    failed.length ? '🚨 সাপ্তাহিক হেলথ চেক: সমস্যা পাওয়া গেছে' : '🩺 সাপ্তাহিক হেলথ চেক: সব ঠিক আছে',
    ...results.map((r) => `${icon[r.status]} ${r.name}${r.status === 'ok' ? '' : ': ' + r.detail.slice(0, 200)}`),
    week ? `গত ৭ দিনে পোস্ট: ${week.total}` : ''
  ].filter(Boolean).join('\n'));
  if (failed.length) {
    console.error(`[health] ${failed.length} problem(s) found: ${failed.map((f) => f.name).join(', ')}. GitHub will email you about this failed run.`);
    process.exitCode = 1;
  } else {
    console.log('[health] All good.');
  }
}

main().catch((e) => { console.error('[health] Check crashed:', e.message); process.exitCode = 1; });
