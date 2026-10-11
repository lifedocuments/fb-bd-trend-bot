// Thin wrapper around the Anthropic Messages API (raw fetch, no SDK — keeps
// the whole project dependency-free). Needs ANTHROPIC_API_KEY in the
// environment (set it as a GitHub Actions secret, never commit it).

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

async function callClaude({ system, user, maxTokens = 600 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
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

const LANGUAGE_INSTRUCTIONS = {
  bn: 'Write in natural, conversational Bangla, the way a popular Bangladeshi Facebook Page actually writes — it is fine to mix in common English words the way people really talk, but do not write whole sentences in English.',
  en: 'Write in English, in a warm, conversational tone suitable for a Bangladeshi audience.',
  banglish: 'Write in "Banglish" — Bangla sentence structure using Latin letters, the way many Bangladeshi Facebook pages post — mixing in English words naturally.'
};

const SAFETY_SYSTEM_NOTE = `If the topic you are given is about a death, disaster, accident, crime, violence, war, or political unrest, do not write a cheerful or celebratory post about it — instead respond with exactly: SKIP_SENSITIVE_TOPIC`;

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

  return callClaude({ system, user, maxTokens: 400 });
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

  return callClaude({ system, user, maxTokens: 200 });
}
