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

async function callGemini({ system, user, maxTokens }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  // "gemini-flash-latest" is Google's alias for the current Flash model, so
  // this keeps working when Google retires older model versions. Override
  // with the GEMINI_MODEL repo variable if you want to pin a specific one.
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      // Newer Flash models may "think" before answering, which uses output
      // tokens too — so allow generous headroom even for a short caption.
      generationConfig: { maxOutputTokens: Math.max(maxTokens * 4, 2048), temperature: 0.9 }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new Error(`Gemini free-tier limit reached (HTTP 429). It resets daily; try again later. ${body.slice(0, 200)}`);
    }
    throw new Error(`Gemini API returned HTTP ${res.status}: ${body.slice(0, 300)}`);
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

async function callLLM({ system, user, maxTokens = 600 }) {
  const provider = pickProvider();
  console.log(`[ai] Using provider: ${provider}`);
  return provider === 'gemini'
    ? callGemini({ system, user, maxTokens })
    : callClaude({ system, user, maxTokens });
}

const LANGUAGE_INSTRUCTIONS = {
  bn: 'Write in natural, conversational Bangla, the way a popular Bangladeshi Facebook Page actually writes — it is fine to mix in common English words the way people really talk, but do not write whole sentences in English.',
  en: 'Write in English, in a warm, conversational tone suitable for a Bangladeshi audience.',
  banglish: 'Write in "Banglish" — Bangla sentence structure using Latin letters, the way many Bangladeshi Facebook pages post — mixing in English words naturally.'
};

const SAFETY_SYSTEM_NOTE = `If the topic you are given is about a death, disaster, accident, crime, violence, war, or political unrest, do not write a cheerful or celebratory post about it — instead respond with exactly: ${SKIP}`;

export async function writeTrendCaption({ trend, language = 'bn', pageName }) {
  const langInstruction = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.bn;
  const system = [
    `You write short, engaging Facebook posts for "${pageName}", a Bangladeshi Facebook Page that talks about what's trending/viral in Bangladesh right now.`,
    langInstruction,
    'Keep it to 2-4 short sentences plus 3-6 relevant hashtags on a new line at the end (mix Bangla and English hashtags as appropriate). No markdown, no asterisks, no emoji overload (2-4 emoji max). Do not use quotation marks around the whole post.',
    SAFETY_SYSTEM_NOTE
  ].join('\n\n');

  const user = [
    `Trending topic: ${trend.title}`,
    trend.context ? `Context from news headlines: ${trend.context}` : '',
    'Write one Facebook post about this trend for our page\'s audience.'
  ].filter(Boolean).join('\n');

  return callLLM({ system, user, maxTokens: 400 });
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
