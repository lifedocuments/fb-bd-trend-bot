// Weekly learning run (Sunday night): measure the last 30 days of posts,
// let the AI draw lessons, save them for future posts, and write a report
// (reports/latest.md + Telegram).
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEngagement } from './lib/facebook.js';
import { analyzePerformance } from './lib/claude.js';
import { buildStats, sanitizeLearnings, heuristicWeights, saveLearnings } from './lib/brain.js';
import { notify } from './lib/telegram.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const MIN_POSTS = Number(process.env.LEARN_MIN_POSTS || 10);
const PAGE_NAME = process.env.PAGE_NAME || 'our Page';

async function getEngagement(ids) {
  try { return await fetchEngagement(ids); }
  catch (e) {
    console.warn('[learn] Reading with shares failed, retrying without:', e.message);
    return fetchEngagement(ids, { includeShares: false });
  }
}

function table(obj, label) {
  const rows = Object.entries(obj).sort((a, b) => b[1].avgScore - a[1].avgScore);
  if (!rows.length) return '';
  return [`| ${label} | Posts | Avg score |`, '|---|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v.posts} | ${v.avgScore} |`)].join('\n');
}

async function main() {
  let posted = [];
  try { posted = JSON.parse(await readFile(path.join(ROOT, 'data', 'posted.json'), 'utf8')); } catch {}
  const recent = posted.filter((p) => p.postId && !p.skipped && (Date.now() - Date.parse(p.postedAt)) <= 31 * 864e5);
  const engagement = recent.length ? await getEngagement(recent.map((p) => p.postId)) : {};
  const stats = buildStats(posted, engagement);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  console.log(`[learn] ${stats.posts} posts with data (need ${MIN_POSTS}).`);

  let md;
  if (stats.posts < MIN_POSTS) {
    md = `# Weekly report — ${date}\n\nStill collecting data: ${stats.posts} posts measured so far (need ${MIN_POSTS}). The bot keeps its current settings and will learn once there is enough data.\n`;
    await notify(`📊 সাপ্তাহিক রিপোর্ট (${date})\nএখনো ডেটা জমা হচ্ছে: ${stats.posts}টি পোস্ট মাপা হয়েছে (দরকার ${MIN_POSTS})। পরের সপ্তাহে শেখা শুরু হবে।`);
  } else {
    let learned, source = 'AI';
    try {
      learned = sanitizeLearnings(await analyzePerformance(stats, PAGE_NAME), stats);
    } catch (e) {
      console.warn('[learn] AI analysis failed, using numbers only:', e.message);
      learned = { tips: [], insights: [], weights: heuristicWeights(stats) }; source = 'numbers only';
    }
    if (!Object.keys(learned.weights).length) learned.weights = heuristicWeights(stats);
    await saveLearnings({ updatedAt: new Date().toISOString(), basedOnPosts: stats.posts, source, ...learned });

    const top = stats.top.slice(0, 3).map((t, i) => `${i + 1}. ${t.headline} — ${t.category}, ${t.format}, score ${t.score} (👍${t.reactions} 💬${t.comments} ↗${t.shares})`);
    md = [
      `# Weekly report — ${date}`, '',
      `Measured **${stats.posts} posts** from the last 30 days. Average score **${stats.avgScore}** (reactions + 2×comments + 3×shares).`, '',
      '## What the bot learned', ...learned.insights.map((i) => `- ${i}`), '',
      '## New writing lessons (used from now on)', ...(learned.tips.length ? learned.tips.map((t) => `- ${t}`) : ['- (none this week)']), '',
      '## Category weights (above 1 = chosen more often)', ...Object.entries(learned.weights).map(([c, w]) => `- ${c}: ${w}`), '',
      '## Top posts', ...top, '',
      table(stats.byCategory, 'Category'), '', table(stats.byFormat, 'Format'), '', table(stats.bySlot, 'Time slot (BD hour)'), ''
    ].join('\n');
    await notify([`📊 সাপ্তাহিক রিপোর্ট (${date})`, `${stats.posts}টি পোস্ট বিশ্লেষণ করা হয়েছে।`, '', ...learned.insights.map((i) => '• ' + i), '', 'সেরা পোস্ট:', ...top, '', 'বিস্তারিত: /report'].join('\n'));
  }
  await mkdir(path.join(ROOT, 'reports'), { recursive: true });
  await writeFile(path.join(ROOT, 'reports', 'latest.md'), md);
  await writeFile(path.join(ROOT, 'reports', `${date}.md`), md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
  console.log('[learn] Report written to reports/latest.md');
}

main().catch(async (e) => {
  console.error('[learn] FAILED:', e.message);
  await notify(`⚠️ সাপ্তাহিক বিশ্লেষণ ব্যর্থ: ${e.message}`);
  process.exitCode = 1;
});
