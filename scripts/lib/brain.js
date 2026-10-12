// The bot's "brain": weekly stats from your own posts, and the lessons the AI
// drew from them (data/learnings.json), used by every new post.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from './variety.js';
import { scorePost } from './schedule.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LEARNINGS_PATH = path.join(HERE, '..', '..', 'data', 'learnings.json');
const MAX_AGE_DAYS = 30;

export function buildStats(posted, engagement, { now = new Date(), days = 30 } = {}) {
  const rows = posted
    .filter((p) => p.postId && !p.skipped && !p.dryRun && engagement[p.postId]
      && (now - Date.parse(p.postedAt)) <= days * 864e5 && (now - Date.parse(p.postedAt)) >= 20 * 3600e3)
    .map((p) => ({
      headline: p.headline || p.title, category: p.category || 'unknown', format: p.format || 'photo',
      slot: p.slot || null, breaking: !!p.breaking, ...engagement[p.postId], score: scorePost(engagement[p.postId])
    }));
  const group = (key) => {
    const g = {};
    for (const r of rows) {
      const k = r[key] ?? 'none';
      g[k] ||= { posts: 0, total: 0 };
      g[k].posts++; g[k].total += r.score;
    }
    for (const v of Object.values(g)) { v.avgScore = Math.round((v.total / v.posts) * 10) / 10; delete v.total; }
    return g;
  };
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const avg = rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0;
  return {
    posts: rows.length,
    avgScore: Math.round(avg * 10) / 10,
    byCategory: group('category'),
    byFormat: group('format'),
    bySlot: group('slot'),
    breaking: group('breaking'),
    top: sorted.slice(0, 5),
    bottom: sorted.slice(-5).reverse()
  };
}

const BANNED = /\b(like|share|tag|politic|election|vote|party|religio|islam|hindu|government|minister)/i;

export function sanitizeLearnings(ai, stats) {
  const tips = (Array.isArray(ai?.tips) ? ai.tips : [])
    .map((t) => String(t).replace(/\s+/g, ' ').trim()).filter((t) => t && t.length <= 200 && !BANNED.test(t)).slice(0, 6);
  const insights = (Array.isArray(ai?.insights_bn) ? ai.insights_bn : [])
    .map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5);
  const weights = {};
  const src = ai?.category_weights && typeof ai.category_weights === 'object' ? ai.category_weights : {};
  for (const c of CATEGORIES) {
    const enough = (stats.byCategory[c]?.posts || 0) >= 3;
    const v = Number(src[c]);
    if (enough && Number.isFinite(v)) weights[c] = Math.min(1.5, Math.max(0.5, Math.round(v * 100) / 100));
  }
  return { tips, insights, weights };
}

// Fallback when the AI isn't available: weight = category avg / overall avg.
export function heuristicWeights(stats) {
  const w = {};
  if (!stats.avgScore) return w;
  for (const [c, v] of Object.entries(stats.byCategory)) {
    if (CATEGORIES.includes(c) && v.posts >= 3) w[c] = Math.min(1.5, Math.max(0.5, Math.round((v.avgScore / stats.avgScore) * 100) / 100));
  }
  return w;
}

export async function loadLearnings(now = new Date()) {
  try {
    const l = JSON.parse(await readFile(LEARNINGS_PATH, 'utf8'));
    if (!l.updatedAt || (now - Date.parse(l.updatedAt)) > MAX_AGE_DAYS * 864e5) return { tips: [], weights: {} };
    return { tips: Array.isArray(l.tips) ? l.tips : [], weights: l.weights || {} };
  } catch { return { tips: [], weights: {} }; }
}

export async function saveLearnings(l) {
  await writeFile(LEARNINGS_PATH, JSON.stringify(l, null, 2) + '\n');
}
