// আজকের বাজারদর — reads TCB's daily Dhaka retail price report (a PDF),
// lets Gemini turn the table into numbers, CHECKS everything, and builds the
// caption from the data itself (no AI writing, so no invented prices).
// Any doubt → no post (the caller gets a reason to report on Telegram).

export const BAZAR_ITEMS = [
  { key: 'rice_fine', bn: 'চাল (সরু)', unit: 'কেজি', hint: 'Rice, fine (Nazirshail / Miniket) — চাল সরু (নাজির/মিনিকেট)' },
  { key: 'rice_medium', bn: 'চাল (মাঝারি)', unit: 'কেজি', hint: 'Rice, medium (Paijam / Lota) — চাল মাঝারী মানের (পাইজাম/লতা)' },
  { key: 'rice_coarse', bn: 'চাল (মোটা)', unit: 'কেজি', hint: 'Rice, coarse (Swarna / China IRRI) — চাল মোটা (স্বর্ণা/চায়না ইরি)' },
  { key: 'atta', bn: 'আটা (খোলা)', unit: 'কেজি', hint: 'Atta, white, loose — আটা সাদা (খোলা)' },
  { key: 'soybean_oil', bn: 'সয়াবিন তেল (১ লি. বোতল)', unit: 'লিটার', hint: 'Soybean oil, bottled, 1 litre — সয়াবিন তেল (বোতল) ১ লিটার' },
  { key: 'sugar', bn: 'চিনি', unit: 'কেজি', hint: 'Sugar — চিনি' },
  { key: 'lentil', bn: 'মসুর ডাল (মোটা)', unit: 'কেজি', hint: 'Red lentil, big/coarse grain — মসুর ডাল (বড় দানা/মোটা)' },
  { key: 'onion', bn: 'পেঁয়াজ (দেশি)', unit: 'কেজি', hint: 'Onion, local — পেঁয়াজ (দেশী)' },
  { key: 'potato', bn: 'আলু', unit: 'কেজি', hint: 'Potato — আলু' },
  { key: 'garlic', bn: 'রসুন (দেশি)', unit: 'কেজি', hint: 'Garlic, local — রসুন (দেশী)' },
  { key: 'egg', bn: 'ডিম (ফার্মের)', unit: 'হালি', hint: 'Egg, farm (per hali = 4) — ডিম (ফার্ম) প্রতি হালি' },
  { key: 'broiler', bn: 'মুরগি (ব্রয়লার)', unit: 'কেজি', hint: 'Chicken, broiler — মুরগী (ব্রয়লার)' }
];

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const bnNum = (v) => String(v).replace(/\d/g, (d) => BN_DIGITS[d]);
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
export function bnDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${bnNum(d)} ${BN_MONTHS[m - 1]} ${bnNum(y)}`;
}
export const dhakaToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(now);

const DEFAULT_PAGES = ['https://tcb.gov.bd/site/view/daily_rmp', 'https://tcb.portal.gov.bd/site/view/daily_rmp'];

/** Finds the newest TCB daily price PDF. TCB_REPORT_URL (a direct PDF link) overrides. */
export async function findTcbReport() {
  if (/^https?:\/\/.+\.pdf/i.test(process.env.TCB_REPORT_URL || '')) return process.env.TCB_REPORT_URL;
  const pages = (process.env.TCB_PAGE_URL ? [process.env.TCB_PAGE_URL] : DEFAULT_PAGES);
  const errors = [];
  for (const page of pages) {
    try {
      const res = await fetch(page, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fb-bd-trend-bot/1.0)' } });
      if (!res.ok) { errors.push(`${page}: HTTP ${res.status}`); continue; }
      const html = await res.text();
      const links = [...html.matchAll(/href=["']([^"']+?\.pdf)["']/gi)].map((m) => new URL(m[1].replace(/&amp;/g, '&'), page).href);
      const daily = links.filter((u) => /daily|rmp|price|দর/i.test(decodeURIComponent(u)));
      const pick = (daily.length ? daily : links)[0];
      if (pick) return pick;
      errors.push(`${page}: no PDF link found`);
    } catch (e) { errors.push(`${page}: ${e.message}`); }
  }
  throw new Error('TCB report not found (' + errors.join('; ') + ')');
}

/** Gemini reads the PDF table into numbers (it may NOT guess; null when unsure). */
export async function readPricesWithAI(pdfBuffer) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_PDF_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const prompt = [
    'This PDF is the Trading Corporation of Bangladesh (TCB) daily retail market price report for Dhaka.',
    'Copy numbers EXACTLY as printed (Bangla digits converted to normal digits). Never estimate or calculate. If an item or column is not clearly in the report, use null.',
    'For each item below, return today\'s minimum and maximum retail price in Taka, and the minimum and maximum from the "one week ago" column if the report has one.',
    ...BAZAR_ITEMS.map((it) => `- ${it.key}: ${it.hint} (unit: ${it.unit})`),
    'Also return the report date exactly as printed, converted to YYYY-MM-DD.',
    'JSON only: {"report_date": "YYYY-MM-DD"|null, "items": {"<key>": {"min": number|null, "max": number|null, "week_min": number|null, "week_max": number|null}}}'
  ].join('\n');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: pdfBuffer.toString('base64') } }, { text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 4096 }
    })
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0) throw new Error('AI reply was not JSON');
  return JSON.parse(text.slice(a, b + 1));
}

const okNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 5 && v <= 2000;

/**
 * Checks the AI's reading. Returns { ok, reason, reportDate, rows }.
 * rows: [{ key, bn, unit, min, max, trend: 'up'|'down'|'same'|'' }]
 */
export function validatePrices(data, { today = dhakaToday(), lastPrices = null, minItems = 6 } = {}) {
  const d = String(data?.report_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, reason: 'report date not readable' };
  const age = (Date.parse(today) - Date.parse(d)) / 86400000;
  if (age < 0 || age > 2) return { ok: false, reason: `report date ${d} is not from the last 2 days` };
  const rows = [];
  for (const it of BAZAR_ITEMS) {
    const v = data.items?.[it.key];
    if (!v || !okNum(v.min) || !okNum(v.max) || v.min > v.max || v.max > v.min * 2) continue;
    const prev = lastPrices?.[it.key];
    if (prev && (Math.abs((v.min + v.max) / 2 - (prev.min + prev.max) / 2) / ((prev.min + prev.max) / 2)) > 0.5) continue;   // >50% overnight jump = likely misread
    let trend = '';
    if (okNum(v.week_min) && okNum(v.week_max) && v.week_min <= v.week_max) {
      const now = (v.min + v.max) / 2, wk = (v.week_min + v.week_max) / 2;
      trend = now > wk ? 'up' : now < wk ? 'down' : 'same';
    }
    rows.push({ key: it.key, bn: it.bn, unit: it.unit, min: v.min, max: v.max, trend });
  }
  if (rows.length < minItems) return { ok: false, reason: `only ${rows.length} item(s) could be read reliably (need ${minItems})` };
  return { ok: true, reportDate: d, rows };
}

/** Caption straight from the data. */
export function bazarCaption({ reportDate, rows }, { pageName = '', brandHashtag = '#SakinMartBD' } = {}) {
  const arrow = (t) => (t === 'up' ? ' 🔺' : t === 'down' ? ' 🔻' : '');
  const price = (r) => (r.min === r.max ? `৳${bnNum(r.min)}` : `৳${bnNum(r.min)}–${bnNum(r.max)}`);
  const lines = rows.map((r) => `• ${r.bn}: ${price(r)}/${r.unit}${arrow(r.trend)}`);
  const hasTrend = rows.some((r) => r.trend === 'up' || r.trend === 'down');
  return [
    `🛒 আজকের বাজারদর (ঢাকা, ${bnDate(reportDate)})`,
    '',
    ...lines,
    '',
    ...(hasTrend ? ['🔺/🔻 গত সপ্তাহের তুলনায়'] : []),
    'উৎস: টিসিবি (TCB) দৈনিক খুচরা বাজারদর',
    '',
    'আপনার এলাকার বাজারে আজ দাম কেমন দেখছেন? কমেন্টে জানান।',
    '',
    `#বাজারদর #দ্রব্যমূল্য ${brandHashtag}`.trim()
  ].join('\n');
}
