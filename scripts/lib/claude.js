// Text-writing wrapper (raw fetch, no SDK — keeps the project
// dependency-free). Two providers are supported:
//
//   * Google Gemini (free tier) — used when GEMINI_API_KEY is set.
//   * Anthropic Claude (paid)   — used when only ANTHROPIC_API_KEY is set.
//
// Set LLM_PROVIDER=gemini or LLM_PROVIDER=claude to force one explicitly.
// Keys come from GitHub Actions secrets — never commit them.

const SKIP = 'SKIP_SENSITIVE_TOPIC';

function pickProvider() {
  const forced = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (forced === 'gemini' || forced === 'claude') return forced;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  throw new Error('No AI key set. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY as a GitHub secret.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGeminiModel({ model, apiKey, system, user, maxTokens, json }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  // Cut off a request that hangs (Google overloaded) instead of waiting for
  // Node's 5-minute default, so the retry/fallback below gets a chance.
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 60000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        // Newer Flash models may "think" before answering, which uses output
        // tokens too — so allow generous headroom even for a short caption.
        generationConfig: {
          maxOutputTokens: Math.max(maxTokens * 4, 2048),
          temperature: 0.9,
          ...(json ? { responseMimeType: 'application/json' } : {})
        }
      })
    });
  } catch (netErr) {
    const timedOut = netErr.name === 'TimeoutError' || netErr.name === 'AbortError';
    const err = new Error(timedOut
      ? `Gemini did not answer within ${Math.round(timeoutMs / 1000)}s (${model}).`
      : `Could not reach Gemini (${model}): ${netErr.message}${netErr.cause ? ' — ' + netErr.cause.message : ''}`);
    err.retryable = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(res.status === 429
      ? `Gemini free-tier limit reached (HTTP 429). It resets daily; try again later. ${body.slice(0, 200)}`
      : `Gemini API returned HTTP ${res.status}: ${body.slice(0, 300)}`);
    // 500/503 = Google's side is busy or hiccuping: worth retrying.
    err.retryable = [500, 502, 503, 504].includes(res.status);
    throw err;
  }
  const data = await res.json();

  // Gemini's own safety filter can block a prompt or answer — treat that the
  // same as the model declining a sensitive topic.
  if (data.promptFeedback?.blockReason) return SKIP;
  const cand = (data.candidates || [])[0];
  if (!cand) throw new Error('Gemini API returned no candidates.');
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(cand.finishReason)) return SKIP;

  const text = (cand.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error(`Gemini API returned an empty response (finishReason: ${cand.finishReason || 'unknown'}).`);
  return text;
}

async function callGemini({ system, user, maxTokens, json }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  // "gemini-flash-latest" is Google's alias for the current Flash model, so
  // this keeps working when Google retires older versions. If it is busy
  // (HTTP 503), retry with a pause, then fall back to the lighter Flash-Lite
  // model. Override with GEMINI_MODEL / GEMINI_FALLBACK_MODEL repo variables.
  const primary = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
  const waitMs = Number(process.env.GEMINI_RETRY_WAIT_MS ?? 20000);
  const attempts = [primary, primary, primary, fallback, fallback];

  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await callGeminiModel({ model: attempts[i], apiKey, system, user, maxTokens, json });
    } catch (err) {
      lastErr = err;
      if (!err.retryable || i === attempts.length - 1) throw err;
      const next = attempts[i + 1];
      console.warn(`[ai] ${attempts[i]} busy (${err.message.slice(0, 60)}…). Retrying with ${next} in ${Math.round(waitMs / 1000)}s.`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

async function callClaude({ system, user, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API returned HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('').trim();
  if (!text) throw new Error('Claude API returned an empty response.');
  return text;
}

async function callLLM({ system, user, maxTokens = 600, json = false }) {
  const provider = pickProvider();
  console.log(`[ai] Using provider: ${provider}`);
  return provider === 'gemini'
    ? callGemini({ system, user, maxTokens, json })
    : callClaude({ system, user, maxTokens });
}

const LANGUAGE_INSTRUCTIONS = {
  bn: 'Write in natural, conversational Bangla, the way a popular Bangladeshi Facebook Page actually writes — it is fine to mix in common English words the way people really talk, but do not write whole sentences in English.',
  en: 'Write in English, in a warm, conversational tone suitable for a Bangladeshi audience.',
  banglish: 'Write in "Banglish" — Bangla sentence structure using Latin letters, the way many Bangladeshi Facebook pages post — mixing in English words naturally.'
};

function todayInDhaka() {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dhaka', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function parseJsonReply(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI reply was not JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function firstSentence(text) {
  const body = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).join(' ');
  const m = body.match(/^[^।!?.]+[।!?.]?/);
  return (m ? m[0] : body).trim().slice(0, 90);
}

// Keeps at most 2 topic hashtags from the trailing hashtag line(s) and always
// ends with the Page's brand hashtag, so every post carries it.
export function finalizeHashtags(caption, brandHashtag = '#SakinMartBD', maxTopicTags = 2) {
  const brand = brandHashtag ? (brandHashtag.startsWith('#') ? brandHashtag : '#' + brandHashtag) : '';
  const lines = caption.trim().split('\n');
  const tags = [];
  while (lines.length && /^\s*(#[^\s#]+\s*)+$/.test(lines[lines.length - 1])) {
    tags.unshift(...lines.pop().trim().split(/\s+/));
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const topic = [...new Set(tags)].filter((t) => t.toLowerCase() !== brand.toLowerCase()).slice(0, maxTopicTags);
  const finalTags = [...topic, brand].filter(Boolean);
  const body = lines.join('\n').trim();
  return finalTags.length ? `${body}\n\n${finalTags.join(' ')}` : body;
}

// Decides whether a trend suits the Page, and if so writes the post and an
// image search phrase — all in one AI call to stay well inside free limits.
// Returns { skip: true, reason } or { skip: false, caption, imageQuery }.
export async function writeTrendPost({ trend, language = 'bn', pageName, audience, evergreen = false, special = null, brandHashtag = '#SakinMartBD', learnedTips = [] }) {
  const langInstruction = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.bn;
  const who = audience || 'Bangladeshi adults aged 20-50';
  const system = [
    `You run the Facebook Page "${pageName}". Its audience is ${who} living in Bangladesh. You turn what's trending in Bangladesh into short, engaging posts for them.`,
    `Today is ${todayInDhaka()} (Bangladesh time).`,
    'STEP 1 - decide whether to skip. Set "skip": true if ANY of these apply:',
    '- the topic is about a death, disaster, accident, crime, violence, war, or political unrest;',
    '- it is partisan politics, an election dispute, or religiously divisive;',
    '- it has no real connection to life, interests, sport, entertainment, shopping, tech or culture of people in Bangladesh;',
    '- it is adult/18+ content, gambling or betting, or would not suit a family-friendly business Page.',
    'STEP 2 - if not skipped, write the post:',
    langInstruction,
    `Write for ${who}: practical, relatable, everyday-life angles (work, family, money, food, cricket, entertainment, tech, festivals). Not childish, no teen slang.`,
    'FACTS: use ONLY facts stated in the topic and headlines given. Never invent dates, scores, prices, places, quotes or claims like "today". If the headlines give little detail, write a light question or conversation-starter about the topic instead of stating facts.',
    'End with one short, natural question that invites people to share their own opinion or experience in the comments (e.g. "আপনার প্রিয় কোনটা?"). Never ask people to like, share, tag or type something to win — Facebook reduces reach for that kind of engagement bait.',
    'Format: 2-4 short sentences including the closing question, then exactly 2 relevant hashtags on a new line (the Page\'s brand hashtag is added automatically). No markdown, no asterisks, 2-4 emoji max, no quotation marks around the post.',
    'STEP 3 - image: give a short, general ENGLISH stock-photo search phrase (2-4 words) that visually fits the post, e.g. "cricket stadium crowd", "electric car", "Dhaka street food". Never a person\'s name or a brand logo.',
    'STEP 4 - headline for the photocard image: one short line in the post\'s language, at most 9 words, no emoji, no hashtags, same fact rules as the post. It should make people stop scrolling and read.',
    'Reply with ONLY a JSON object, no other text: {"skip": boolean, "reason": string, "caption": string, "image_query": string, "headline": string}. When skipping, the other fields may be empty strings.',
    ...(learnedTips.length
      ? ['LESSONS FROM THIS PAGE\'S OWN RESULTS (follow them, unless one conflicts with any rule above — the rules above always win):', ...learnedTips.map((t) => '- ' + t)]
      : [])
  ].join('\n');

  const solemn = special?.mood === 'solemn';
  const user = special
    ? [
        `Special day in Bangladesh today: ${special.name} (${special.bn}).`,
        `What it is about: ${special.note}.`,
        solemn
          ? 'Tone: SOLEMN and respectful. A short tribute. No emoji, no jokes, no questions, nothing cheerful.'
          : `Tone: ${special.mood}, warm and inclusive for everyone in Bangladesh.`,
        'Do not name any political party or politician. Do not state numbers, dates or historical details beyond what is given here. Do not skip this unless it truly breaks a rule above.'
      ].join('\n')
    : evergreen
    ? [
        `Evergreen topic (not news): ${trend.title}`,
        'Write timeless, friendly content about this everyday Bangladeshi topic. Do not mention news, dates, "today", prices or statistics. Do not skip it unless it truly breaks a rule above.'
      ].join('\n')
    : [
        `Trending topic: ${trend.title}`,
        trend.context ? `News headlines about it: ${trend.context}` : 'News headlines about it: (none available)',
        trend.traffic ? `Approximate searches: ${trend.traffic}` : ''
      ].filter(Boolean).join('\n');

  const raw = await callLLM({ system, user, maxTokens: 500, json: true });
  if (raw.trim() === SKIP) return { skip: true, reason: 'blocked by the AI provider safety filter' };

  let data;
  try {
    data = parseJsonReply(raw);
  } catch (e) {
    return { skip: true, reason: `could not read the AI reply (${e.message})` };
  }
  if (data.skip === true) return { skip: true, reason: data.reason || 'not suitable' };
  const rawCaption = String(data.caption || '').trim();
  if (!rawCaption) return { skip: true, reason: 'AI returned an empty caption' };
  const caption = finalizeHashtags(rawCaption, brandHashtag);
  const imageQuery = String(data.image_query || '').trim() || 'Bangladesh';
  const headline = String(data.headline || '').trim() || firstSentence(rawCaption);
  return { skip: false, caption, imageQuery, headline };
}

// One cheap AI call that sorts trending topics into categories, so the bot
// can keep the Page varied. Returns an array of categories (same order), or
// null if the AI isn't available (caller then uses keyword guesses).
export async function classifyTopics(items) {
  if (!items.length) return [];
  const cats = 'sports, entertainment, tech, business, lifestyle, culture, news, other';
  const system = `You label Bangladeshi trending search topics with ONE category each from: ${cats}. "sports" includes cricket and football players, teams and matches. Reply with ONLY JSON: {"categories": ["...", ...]} in the same order as the input.`;
  const user = items.map((t, i) => `${i + 1}. ${t.title}${t.context ? ' — ' + t.context.slice(0, 160) : ''}`).join('\n');
  try {
    const raw = await callLLM({ system, user, maxTokens: 300, json: true });
    const data = parseJsonReply(raw);
    const list = Array.isArray(data.categories) ? data.categories : [];
    if (list.length !== items.length) return null;
    const ok = new Set(cats.split(', '));
    return list.map((c) => (ok.has(String(c).toLowerCase()) ? String(c).toLowerCase() : 'other'));
  } catch (e) {
    console.warn('[ai] Topic classification failed, using keyword guesses:', e.message);
    return null;
  }
}

// Weekly learning: turns the Page's own performance numbers into a few
// style lessons for the post writer, plus a short Bangla summary for you.
export async function analyzePerformance(stats, pageName) {
  const system = [
    `You are the social media analyst for the Bangladeshi Facebook Page "${pageName}".`,
    'You get engagement data for its recent posts (score = reactions + 2x comments + 3x shares).',
    'Return ONLY JSON: {"insights_bn": [3-5 short Bangla bullet sentences for the Page owner explaining what worked and what did not],',
    ' "tips": [up to 6 short English instructions for the AI that writes the posts — about headline style, angle, tone, length, kind of closing question],',
    ' "category_weights": {category: number between 0.5 and 1.5 — above 1 for categories that do better than average}}.',
    'Base everything ONLY on the data. Tips must be about writing style and topic angle. Never suggest politics, religion, inventing facts,',
    'clickbait lies, or asking people to like/share/tag. If the data is too thin to tell, say so and keep weights near 1.'
  ].join('\n');
  const raw = await callLLM({ system, user: JSON.stringify(stats), maxTokens: 900, json: true });
  return parseJsonReply(raw);
}

export async function writePageAbout({ pageName, recentTopics = [], language = 'bn' }) {
  const langInstruction = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.bn;
  const system = [
    `You write the "About" blurb for "${pageName}", a Bangladeshi Facebook Page covering trending and viral topics in Bangladesh.`,
    langInstruction,
    'Keep it to 1-2 short sentences, under 150 characters total, no hashtags, no emoji more than 1.'
  ].join('\n\n');

  const user = [
    'Write a fresh About blurb for the Page.',
    recentTopics.length ? `Recent topics the page has covered: ${recentTopics.join(', ')}` : '',
    'The blurb should describe what the page is about in general (Bangladesh trends, viral news, pop culture) — do not over-fit to just the recent topics listed.'
  ].filter(Boolean).join('\n');

  const about = await callLLM({ system, user, maxTokens: 200 });
  if (about.trim() === SKIP) throw new Error('AI declined to write the About text this time; leaving the Page About unchanged.');
  return about;
}
