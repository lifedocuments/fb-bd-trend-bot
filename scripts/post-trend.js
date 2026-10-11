#!/usr/bin/env node
// Main entry point: picks the best fresh, safe BD trend, writes a caption
// for it with Claude, finds an image, and posts it to the Facebook Page.
//
// Run with DRY_RUN=true to fetch real trends and run the safety/dedupe
// logic without calling Claude, Unsplash, or Facebook at all (no API keys
// needed) — useful for a first sanity check. See README.md.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBdTrends } from './lib/trends.js';
import { filterSafeTrends } from './lib/safety.js';
import { writeTrendCaption } from './lib/claude.js';
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
  const postedTitles = new Set(posted.map((p) => normalizeTitle(p.title)));
  const freshTrends = safeTrends.filter((t) => !postedTitles.has(normalizeTitle(t.title)));
  console.log(`[post-trend] ${freshTrends.length} haven't been posted before.`);

  if (!freshTrends.length) {
    console.log('[post-trend] No fresh, safe trend available right now. Exiting without posting.');
    return;
  }

  // Try candidates in order (trending rank) until one actually produces a
  // caption — Claude itself may also refuse a trend as sensitive even after
  // the keyword filter let it through (see SAFETY note in claude.js).
  for (const trend of freshTrends.slice(0, 5)) {
    console.log(`[post-trend] Trying trend: "${trend.title}"`);

    let caption;
    if (DRY_RUN) {
      caption = `[DRY RUN] Would write a ${LANGUAGE} caption about: ${trend.title}`;
    } else {
      caption = await writeTrendCaption({ trend, language: LANGUAGE, pageName: PAGE_NAME });
      if (caption.trim() === 'SKIP_SENSITIVE_TOPIC') {
        console.log(`[post-trend] Claude flagged "${trend.title}" as sensitive. Trying next candidate.`);
        continue;
      }
    }

    let imageUrl = null;
    if (DRY_RUN) {
      imageUrl = trend.picture || '[DRY RUN would search Unsplash]';
    } else {
      imageUrl = await pickImageForTrend(trend);
    }

    console.log('[post-trend] Caption:\n' + caption);
    console.log('[post-trend] Image URL: ' + imageUrl);

    if (DRY_RUN) {
      console.log('[post-trend] DRY RUN — not calling the Facebook API.');
    } else {
      const pageId = process.env.FB_PAGE_ID;
      if (!pageId) throw new Error('FB_PAGE_ID is not set.');

      let result;
      if (imageUrl && /^https?:\/\//.test(imageUrl)) {
        result = await postPhotoToPage({ pageId, imageUrl, caption, publish: AUTO_PUBLISH });
      } else {
        console.warn('[post-trend] No image found — posting text-only.');
        result = await postTextToPage({ pageId, message: caption, publish: AUTO_PUBLISH });
      }
      console.log('[post-trend] Facebook API response:', JSON.stringify(result));
      console.log(AUTO_PUBLISH
        ? '[post-trend] Published live to the Page.'
        : '[post-trend] Saved as an unpublished draft — review and publish it from Meta Business Suite, or set AUTO_PUBLISH=true once you trust the pipeline.');
    }

    posted.push({ title: trend.title, postedAt: new Date().toISOString(), dryRun: DRY_RUN });
    await savePostedLog(posted);
    return;
  }

  console.log('[post-trend] All top candidates were flagged sensitive. Nothing posted this run.');
}

main().catch((err) => {
  console.error('[post-trend] FAILED:', err.message);
  process.exitCode = 1;
});
