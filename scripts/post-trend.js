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
import { fetchBdTrends, fetchTopicNews } from './lib/trends.js';
import { orderForVariety, guessCategory } from './lib/variety.js';
import { filterSafeTrends } from './lib/safety.js';
import { writeTrendPost, classifyTopics } from './lib/claude.js';
import { EVERGREEN_TOPICS } from './lib/evergreen.js';
import { specialDayFor } from './lib/special-days.js';
import { makePhotocard } from './lib/photocard.js';
import { pickImageForTrend } from './lib/image.js';
import { postPhotoToPage, postTextToPage, commentOnPost, postReelToPage, postStoryToPage } from './lib/facebook.js';
import { makeStoryImage } from './lib/story.js';
import { loadLearnings } from './lib/brain.js';
import { notify, postLink } from './lib/telegram.js';
import { findBreaking } from './lib/breaking.js';
import { breakingOptions } from './lib/breaking-config.js';
import { makeReel } from './lib/reel.js';

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
const MAX_SPORTS_PER_DAY = process.env.MAX_SPORTS_PER_DAY ? Number(process.env.MAX_SPORTS_PER_DAY) : 1;
const TOPIC_FEEDS = /^none$/i.test(process.env.TOPIC_FEEDS || '')
  ? []
  : (process.env.TOPIC_FEEDS || 'ENTERTAINMENT,TECHNOLOGY,BUSINESS').toUpperCase().split(/[\s,]+/).filter(Boolean);
const BREAKING = String(process.env.BREAKING).toLowerCase() === 'true';
const STORIES_ON = String(process.env.STORIES ?? 'true').toLowerCase() !== 'false';
const MAKE_REEL = String(process.env.MAKE_REEL).toLowerCase() === 'true';
const SLOT_HOUR = Number(process.env.SLOT_HOUR) || null;
const NEWS_COMMENT_ON = String(process.env.NEWS_LINK_COMMENT ?? 'true').toLowerCase() !== 'false';
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

// Facebook returns post ids in different shapes: photo posts give
// "PAGEID_POSTID", Reels give a bare "POSTID" (which the API rejects as a
// legacy "status" object). Build the full id, and for Reels also try the
// video id itself.
function commentTargets(result, pageId, format) {
  const targets = [];
  if (result.post_id) {
    const pid = String(result.post_id);
    targets.push(pid.includes('_') ? pid : `${pageId}_${pid}`);
  }
  if (format === 'reel' && result.video_id) targets.push(String(result.video_id));
  if (!targets.length && result.id) targets.push(String(result.id));
  return [...new Set(targets)];
}

async function addNewsComment({ result, pageId, format, message, newsUrl }) {
  const targets = commentTargets(result, pageId, format);
  // A new Reel is still processing on Facebook's side for a while, so retry.
  const attempts = format === 'reel' ? 4 : 2;
  const firstWait = format === 'reel' ? Number(process.env.REEL_COMMENT_DELAY_MS ?? 20000) : 0;
  const retryWait = Number(process.env.COMMENT_RETRY_MS ?? 30000);
  if (firstWait) await sleep(firstWait);
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    for (const objectId of targets) {
      try {
        await commentOnPost({ objectId, message });
        console.log(`[post-trend] Added news-link comment on ${objectId}: ${newsUrl}`);
        return true;
      } catch (e) {
        lastErr = e;
        if (/\(#200\)|\(#10\)|code 200,|code 10,/i.test(e.message)) {
          console.warn(`[post-trend] Could not add the news-link comment: ${e.message}`);
          console.warn('[post-trend] The Page token needs the pages_manage_engagement permission. See README "News-link comments".');
          return false;
        }
      }
    }
    if (attempt < attempts) {
      console.log(`[post-trend] Comment not accepted yet (${lastErr?.message?.slice(0, 90)}…). Retrying in ${Math.round(retryWait / 1000)}s.`);
      await sleep(retryWait);
    }
  }
  // The post is already live, so never fail the run over the comment.
  console.warn(`[post-trend] Could not add the news-link comment: ${lastErr?.message}`);
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[post-trend] DRY_RUN=${DRY_RUN} AUTO_PUBLISH=${AUTO_PUBLISH} LANGUAGE=${LANGUAGE}`);
  const learnings = await loadLearnings();
  if (learnings.tips.length || Object.keys(learnings.weights).length) {
    console.log(`[post-trend] Using ${learnings.tips.length} learned writing lesson(s) and category weights ${JSON.stringify(learnings.weights)}.`);
  }

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
  if (BREAKING) {
    // Breaking mode: only a topic that just exploded in searches; no
    // special days, news sections or evergreen fallback.
    const { candidates: hot, reason } = findBreaking(safeTrends, posted, breakingOptions());
    if (!hot.length) {
      console.log(`[post-trend] Breaking check: nothing to post (${reason}).`);
      return;
    }
    const top = hot.slice(0, 3);
    const classifyOnB = String(process.env.CLASSIFY_TOPICS ?? 'true').toLowerCase() !== 'false';
    const catsB = DRY_RUN || !classifyOnB ? null : await classifyTopics(top);
    const opts = breakingOptions();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
    const sportsToday = posted.filter((p) => !p.skipped && p.category === 'sports' && p.postedAt
      && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(p.postedAt)) === today).length;
    for (const [i, t] of top.entries()) {
      const category = catsB?.[i] || t.category;
      if (category === 'sports' && sportsToday >= opts.maxSportsPerDay) {
        console.log(`[post-trend] Breaking: skipping "${t.title}" — sports limit for today reached.`);
        continue;
      }
      candidates.push({ trend: { ...t, origin: 'trend', category }, breaking: true });
    }
    console.log(`[post-trend] Breaking check: ${candidates.length} topic(s) above ${opts.minTraffic.toLocaleString('en')} searches.`);
  } else {
    // A special day (Victory Day, Pohela Boishakh, ...) goes first, once per day.
    const special = SPECIAL_DAYS_ON ? specialDayFor() : null;
    if (special && !posted.some((p) => p.special === special.key)) {
      console.log(`[post-trend] Today is a special day: ${special.name}.`);
      candidates.push({ trend: { title: special.name, context: '' }, special });
    }
    // Sort trends into categories (one cheap AI call; keyword guess as backup),
    // add non-sports news sections, then order everything for variety.
    const topTrends = freshTrends.slice(0, 10);
    const classifyOn = String(process.env.CLASSIFY_TOPICS ?? 'true').toLowerCase() !== 'false';
    const cats = DRY_RUN || !classifyOn ? null : await classifyTopics(topTrends);
    const trendPool = topTrends.map((t, i) => ({ ...t, origin: 'trend', category: cats?.[i] || guessCategory(`${t.title} ${t.context}`) }));
    let newsPool = [];
    if (TOPIC_FEEDS.length) {
      const news = await fetchTopicNews(TOPIC_FEEDS);
      newsPool = filterSafeTrends(news).filter((t) => !postedTitles.has(normalizeTitle(t.title)));
      console.log(`[post-trend] ${newsPool.length} fresh stories from Google News sections (${TOPIC_FEEDS.join(', ')}).`);
    }
    const { ordered, todayCounts, lastCategory, droppedSports } = orderForVariety([...trendPool, ...newsPool], posted, { maxSportsPerDay: MAX_SPORTS_PER_DAY, categoryWeights: learnings.weights });
    console.log(`[post-trend] Variety: today so far ${JSON.stringify(todayCounts)}, last post was "${lastCategory || 'none'}"${droppedSports ? `, holding back ${droppedSports} sports topic(s) (daily limit ${MAX_SPORTS_PER_DAY})` : ''}.`);
    candidates.push(...ordered.map((t) => ({ trend: t, evergreen: false })));
    if (EVERGREEN_ON) {
      const recentEvergreen = new Set(posted.filter((p) => p.evergreen).slice(-(EVERGREEN_TOPICS.length - 1)).map((p) => p.title));
      const nextTopics = EVERGREEN_TOPICS.filter((t) => !recentEvergreen.has(t)).slice(0, 2);
      candidates.push(...nextTopics.map((t) => ({ trend: { title: t, context: '' }, evergreen: true })));
    }
  }
  if (!candidates.length) {
    console.log('[post-trend] No fresh, safe trend available right now. Exiting without posting.');
    return;
  }

  for (const { trend, evergreen = false, special: sp = null, breaking = false } of candidates) {
    const kind = sp ? 'special' : evergreen ? 'evergreen' : 'trend';
    console.log(`[post-trend] Trying ${sp ? 'special day' : evergreen ? 'evergreen topic' : trend.origin === 'news' ? 'news story' : 'trend'}: "${trend.title}"${trend.category ? ` [${trend.category}]` : ''}`);

    let caption;
    let imageQuery = '';
    let headline = '';
    if (DRY_RUN) {
      caption = `[DRY RUN] Would write a ${LANGUAGE} caption about: ${trend.title}`;
    } else {
      const post = await writeTrendPost({
        trend, evergreen, special: sp, language: LANGUAGE, pageName: PAGE_NAME, audience: AUDIENCE, brandHashtag: BRAND_HASHTAG, learnedTips: learnings.tips
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
    let reelPath = null;
    let visual = null;
    if (DRY_RUN) {
      imageUrl = '[DRY RUN would search Unsplash]';
    } else {
      const image = await pickImageForTrend(trend, imageQuery);
      if (image) {
        imageUrl = image.url;
        if (image.credit) caption = `${caption}\n\n${image.credit}`;
      }
      visual = {
        imageUrl,
        headline,
        label: sp ? 'বিশেষ দিন' : evergreen ? 'আলাপ' : breaking ? 'এখন ট্রেন্ডিং' : 'ট্রেন্ডিং',
        credit: image?.cardCredit || '',
        pageName: PAGE_NAME,
        mood: sp?.mood === 'solemn' ? 'solemn' : 'normal'
      };
      if (MAKE_REEL) {
        reelPath = await makeReel(visual);
        console.log(reelPath ? `[post-trend] Reel ready (headline: "${headline}").` : '[post-trend] Reel could not be built — will post a photocard instead.');
      }
      if (!reelPath && PHOTOCARDS_ON) {
        cardPath = await makePhotocard({ ...visual, tag: BRAND_HASHTAG.startsWith('#') ? BRAND_HASHTAG : '#' + BRAND_HASHTAG });
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

    // For live trend posts with a news article, point readers to the comment.
    const newsUrl = /^https?:\/\//.test(trend.newsUrl || '') ? trend.newsUrl : '';
    const willComment = NEWS_COMMENT_ON && AUTO_PUBLISH && kind === 'trend' && !!newsUrl;
    if (willComment) {
      const pointer = '👇 বিস্তারিত খবরের লিংক কমেন্টে';
      caption = caption.includes('\n\n#')
        ? caption.replace('\n\n#', `\n\n${pointer}\n\n#`)
        : `${caption}\n\n${pointer}`;
    }
    let result;
    let format = 'photo';
    if (reelPath) {
      try {
        result = await postReelToPage({ pageId, filePath: reelPath, description: caption, publish: AUTO_PUBLISH });
        format = 'reel';
        console.log('[post-trend] Posted as a Reel.');
      } catch (e) {
        console.warn(`[post-trend] Reel upload failed (${e.message}) — posting a photocard instead.`);
        if (PHOTOCARDS_ON && visual) {
          cardPath = await makePhotocard({ ...visual, tag: BRAND_HASHTAG.startsWith('#') ? BRAND_HASHTAG : '#' + BRAND_HASHTAG });
        }
      }
    }
    if (result) {
      // already posted as a Reel
    } else if (cardPath) {
      result = await postPhotoToPage({ pageId, filePath: cardPath, caption, publish: AUTO_PUBLISH });
    } else if (imageUrl && /^https?:\/\//.test(imageUrl)) {
      result = await postPhotoToPage({ pageId, imageUrl, caption, publish: AUTO_PUBLISH });
    } else {
      console.warn('[post-trend] No image found — posting text-only.');
      result = await postTextToPage({ pageId, message: caption, publish: AUTO_PUBLISH });
      format = 'text';
    }
    console.log('[post-trend] Facebook API response:', JSON.stringify(result));
    if (willComment) {
      const source = trend.newsSource ? ` (${trend.newsSource})` : '';
      const message = `📰 বিস্তারিত পড়ুন${source}:\n${trend.newsTitle ? trend.newsTitle + '\n' : ''}${newsUrl}`;
      await addNewsComment({ result, pageId, format, message, newsUrl });
    } else if (NEWS_COMMENT_ON && kind === 'trend' && newsUrl && !AUTO_PUBLISH) {
      console.log(`[post-trend] Draft mode: no comment added. News link for reference: ${newsUrl}`);
    }
    // Also share it as a Page Story (top of followers' feeds for 24h).
    if (AUTO_PUBLISH && STORIES_ON && visual) {
      try {
        const storyPath = await makeStoryImage({ ...visual });
        if (storyPath) {
          const st = await postStoryToPage({ pageId, filePath: storyPath });
          console.log('[post-trend] Shared to the Page Story:', JSON.stringify(st));
        }
      } catch (e) {
        console.warn(`[post-trend] Could not post the Story (the post itself is live): ${e.message}`);
      }
    }
    console.log(AUTO_PUBLISH
      ? '[post-trend] Published live to the Page.'
      : '[post-trend] Saved as an unpublished draft — review and publish it from Meta Business Suite, or set AUTO_PUBLISH=true once you trust the pipeline.');

    const entry = {
      title: trend.title, postedAt: new Date().toISOString(), format,
      category: sp ? 'culture' : evergreen ? 'lifestyle' : (trend.category || 'news')
    };
    const postId = commentTargets(result, pageId, format)[0];
    if (postId && AUTO_PUBLISH) entry.postId = postId;
    if (SLOT_HOUR) entry.slot = SLOT_HOUR;
    if (breaking) entry.breaking = true;
    if (headline) entry.headline = headline;
    if (format === 'reel' && result.video_id) entry.videoId = String(result.video_id);
    if (evergreen) entry.evergreen = true;
    if (sp) entry.special = sp.key;
    posted.push(entry);
    await savePostedLog(posted);
    const kindLabel = format === 'reel' ? 'রিল' : 'পোস্ট';
    const tags = [breaking ? 'ব্রেকিং' : '', sp ? 'বিশেষ দিন' : '', entry.category, SLOT_HOUR ? `${SLOT_HOUR}:00` : ''].filter(Boolean).join(' · ');
    await notify(AUTO_PUBLISH
      ? `✅ নতুন ${kindLabel} প্রকাশিত (${tags})\n${headline || trend.title}\n${postLink({ format, postId: entry.postId, videoId: entry.videoId, pageId })}`
      : `📝 ড্রাফট সেভ হয়েছে (${tags})\n${headline || trend.title}\nMeta Business Suite → Drafts`);
    return;
  }

  console.log('[post-trend] None of the candidates suited the Page this run. Nothing posted; the next scheduled run will try again.');
}

main().catch(async (err) => {
  const msg = err.message + (err.cause ? ' (cause: ' + (err.cause.message || err.cause) + ')' : '');
  console.error('[post-trend] FAILED:', msg);
  process.exitCode = 1;
  if (!DRY_RUN) await notify(`❌ পোস্ট করা যায়নি${BREAKING ? ' (ব্রেকিং)' : ''}:\n${msg.slice(0, 500)}\nGitHub → Actions-এ লগ দেখুন।`);
});
