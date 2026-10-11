#!/usr/bin/env node
// Refreshes the Facebook Page's "About" text periodically (see the weekly
// schedule in .github/workflows/update-about.yml), based on recently posted
// topics, so the Page description doesn't go stale.
//
// Run with DRY_RUN=true to generate the text without actually writing it to
// the Page (still needs ANTHROPIC_API_KEY, since the point is to preview
// Claude's output; it just skips the Graph API call at the end).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePageAbout } from './lib/claude.js';
import { updatePageAbout } from './lib/facebook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '..', 'data', 'posted.json');
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === 'true';
const LANGUAGE = process.env.POST_LANGUAGE || 'bn';
const PAGE_NAME = process.env.PAGE_NAME || 'our Page';

async function main() {
  console.log(`[update-about] DRY_RUN=${DRY_RUN} LANGUAGE=${LANGUAGE}`);

  let recentTopics = [];
  try {
    const raw = await fs.readFile(LOG_PATH, 'utf8');
    const posted = JSON.parse(raw);
    recentTopics = posted.slice(-10).map((p) => p.title);
  } catch {
    // No log yet — fine, writePageAbout handles an empty list.
  }

  const about = await writePageAbout({ pageName: PAGE_NAME, recentTopics, language: LANGUAGE });
  console.log('[update-about] Generated About text:\n' + about);

  if (DRY_RUN) {
    console.log('[update-about] DRY RUN — not writing this to the Page.');
    return;
  }

  const pageId = process.env.FB_PAGE_ID;
  if (!pageId) throw new Error('FB_PAGE_ID is not set.');

  const result = await updatePageAbout({ pageId, about });
  console.log('[update-about] Facebook API response:', JSON.stringify(result));
}

main().catch((err) => {
  console.error('[update-about] FAILED:', err.message + (err.cause ? ' (cause: ' + (err.cause.message || err.cause) + ')' : ''));
  process.exitCode = 1;
});
