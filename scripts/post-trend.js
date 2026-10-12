#!/usr/bin/env node
// Main entry point: picks the best fresh, safe BD trend, writes a caption
// for it with AI (Gemini or Claude), finds an image, and posts it to the Facebook Page.
//
// Run with DRY_RUN=true to fetch real trends and run the safety/dedupe
// logic without calling the AI, Unsplash, or Facebook at all (no API keys
// needed) — useful for a first sanity check. See README.md.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBdTrends } from './lib/trends.js';
import { filterSafeTrends } from './lib/safety.js';
import { writeTrendPost } from './lib/claude.js';
import { EVERGREEN_TOPICS } from './lib/evergreen.js';
import { specialDayFor } from './lib/special-days.js';
import { makePhotocard } from './lib/photocard.js';
import { pickImageForTrend } from './lib/image.js';
import { postPhotoToPage, postTextToPage } from './lib/facebook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '..', 'data', 'posted.json');
const MAX_LOG_ENTRIES = 200;
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === 'true';
// Defaults to draft (unpublished) posts until you flip this in your repo's
// GitHub Actions secrets/variables once you trust the output quality.
const AUTO_PUBLISH = String(process.env.AUTO_PUBLISH).toLowerCase() === 'true';
const LANGUAGE = process.env.POST_LANGUAGE || 'bn';
const PAGE_NAME = process.env.PAGE_NAME || 'our Page';
const AUDIENCE = process.env.TARGET_AUDIENCE || 'Bangladeshi adults aged 20-50';
const BRAND_HASHTAG = process.env.BRAND_HASHTAG || '#SakinMartBD';
const PHOTOCARDS_ON = String(process.env.PHOTOCARDS ?? 'true').toLowerCase() !== 'false';
const SPECIAL_DAYS_ON = String(process.env.SPECIAL_DAYS ?? 'true').toLowerCase() !== 'false';
const EVERGREEN_ON = String(process.env.EVERGREEN_FALLBACK ?? 'true').toLowerCase() !== 'false';

async function loadPostedLog() {
  try {
    const raw = await fs.readFile(LOG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function savePostedLog(entries) {
  const trimmed = entries.slice(-MAX_LOG_ENTRIES);
  await fs.writeFile(LOG_PATH, JSON.stringify(trimmed, null, 2) + '\n');
}

function normalizeTitle(title) {
  return title.trim().toLowerCase();
}

async function main() {
  console.log(`[post-trend] DRY_RUN=${DRY_RUN} AUTO_PUBLISH=${AUTO_PUBLISH} LANGUAGE=${LANGUAGE}`);

  const allTrends = await fetchBdTrends();
  console.log(`[post-trend] Fetched ${allTrends.length} trends from Google Trends BD.`);

  const safeTrends = filterSafeTrends(allTrends);
  console.log(`[post-trend] ${safeTrends.length} passed the sensitive-topic filter.`);

  const posted = await loadPostedLog();
  // Dry-run entries (from older versions) don't count as posted.
  const postedTitles = new Set(posted.filter((p) => !p.dryRun).map((p) => normalizeTitle(p.title)));
  const freshTrends = safeTrends.filter((t) => !postedTitles.has(normalizeTitle(t.title)));
  console.log(`[post-trend] ${freshTrends.length} haven't been posted before.`);

  // Candidates: fresh trends first (in trending order), then evergreen
  // topics so the Page never goes quiet on a slow trends day.
  const candidates = [];
  // A special day (Victory Day, Pohela Boishakh, ...) goes first, once per day.
  const special = SPECIAL_DAYS_ON ? specialDayFor() : null;
  if (special && !posted.some((p) => p.special === special.key)) {
    console.log(`[post-trend] Today is a special day: ${special.name}.`);
    candidates.push({ trend: { title: special.name, context: '' }, special });
  }
  candidates.push(...freshTrends.slice(0, 5).map((t) => ({ trend: t, evergreen: false })));
  if (EVERGREEN_ON) {
    const recentEvergreen = new Set(posted.filter((p) => p.evergreen).slice(-(EVERGREEN_TOPICS.length - 1)).map((p) => p.title));
    const nextTopics = EVERGREEN_TOPICS.filter((t) => !recentEvergreen.has(t)).slice(0, 2);
    candidates.push(...nextTopics.map((t) => ({ trend: { title: t, context: '' }, evergreen: true })));
  }
  if (!candidates.length) {
    console.log('[post-trend] No fresh, safe trend available right now. Exiting without posting.');
    return;
  }

  for (const { trend, evergreen = false, special: sp = null } of candidates) {
    const kind = sp ? 'special' : evergreen ? 'evergreen' : 'trend';
    console.log(`[post-trend] Trying ${sp ? 'special day' : evergreen ? 'evergreen topic' : 'trend'}: "${trend.title}"`);

    let caption;
    let imageQuery = '';
    let headline = '';
    if (DRY_RUN) {
      caption = `[DRY RUN] Would write a ${LANGUAGE} caption about: ${trend.title}`;
    } else {
      const post = await writeTrendPost({
        trend, evergreen, special: sp, language: LANGUAGE, pageName: PAGE_NAME, audience: AUDIENCE, brandHashtag: BRAND_HASHTAG
      });
      if (post.skip) {
        console.log(`[post-trend] Skipping "${trend.title}": ${post.reason}. Trying next candidate.`);
        // Remember skipped trends so later runs don't spend AI calls on them.
        if (kind === 'trend') {
          posted.push({ title: trend.title, skippedAt: new Date().toISOString(), skipped: true, reason: post.reason });
          await savePostedLog(posted);
        }
        continue;
      }
      caption = post.caption;
      imageQuery = post.imageQuery;
      headline = post.headline;
      console.log(`[post-trend] Image search phrase: "${imageQuery}"`);
    }

    let imageUrl = null;
    let cardPath = null;
    if (DRY_RUN) {
      imageUrl = '[DRY RUN would search Unsplash]';
    } else {
      const image = await pickImageForTrend(trend, imageQuery);
      if (image) {
        imageUrl = image.url;
        if (image.credit) caption = `${caption}\n\n${image.credit}`;
      }
      if (PHOTOCARDS_ON) {
        cardPath = await makePhotocard({
          imageUrl,
          headline,
          label: sp ? 'বিশেষ দিন' : evergreen ? 'আলাপ' : 'ট্রেন্ডিং',
          credit: image?.cardCredit || '',
          pageName: PAGE_NAME,
          tag: BRAND_HASHTAG.startsWith('#') ? BRAND_HASHTAG : '#' + BRAND_HASHTAG,
          mood: sp?.mood === 'solemn' ? 'solemn' : 'normal'
        });
        console.log(cardPath ? `[post-trend] Photocard ready (headline: "${headline}").` : '[post-trend] No photocard this time.');
      }
    }

    console.log('[post-trend] Caption:\n' + caption);
    console.log('[post-trend] Image URL: ' + imageUrl);

    if (DRY_RUN) {
      console.log('[post-trend] DRY RUN — not calling the Facebook API or recording anything.');
      return;
    }

    const pageId = process.env.FB_PAGE_ID;
    if (!pageId) throw new Error('FB_PAGE_ID is not set.');
    let result;
    if (cardPath) {
      result = await postPhotoToPage({ pageId, filePath: cardPath, caption, publish: AUTO_PUBLISH });
    } else if (imageUrl && /^https?:\/\//.test(imageUrl)) {
      result = await postPhotoToPage({ pageId, imageUrl, caption, publish: AUTO_PUBLISH });
    } else {
      console.warn('[post-trend] No image found — posting text-only.');
      result = await postTextToPage({ pageId, message: caption, publish: AUTO_PUBLISH });
    }
    console.log('[post-trend] Facebook API response:', JSON.stringify(result));
    console.log(AUTO_PUBLISH
      ? '[post-trend] Published live to the Page.'
      : '[post-trend] Saved as an unpublished draft — review and publish it from Meta Business Suite, or set AUTO_PUBLISH=true once you trust the pipeline.');

    const entry = { title: trend.title, postedAt: new Date().toISOString() };
    if (evergreen) entry.evergreen = true;
    if (sp) entry.special = sp.key;
    posted.push(entry);
    await savePostedLog(posted);
    return;
  }

  console.log('[post-trend] None of the candidates suited the Page this run. Nothing posted; the next scheduled run will try again.');
}

main().catch((err) => {
  console.error('[post-trend] FAILED:', err.message + (err.cause ? ' (cause: ' + (err.cause.message || err.cause) + ')' : ''));
  process.exitCode = 1;
});
