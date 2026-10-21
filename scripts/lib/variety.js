// Keeps the Page varied: Google Trends in Bangladesh is mostly cricket, so
// without this nearly every post would be sports.
//   * at most MAX_SPORTS_PER_DAY sports posts per day (Bangladesh time)
//   * never the same category twice in a row when there's an alternative
//   * prefer the category posted least today
export const CATEGORIES = ['sports', 'showbiz', 'entertainment', 'fintech', 'tech', 'business', 'politics', 'lifestyle', 'culture', 'news', 'other'];

const SPORTS_RE = /cricket|ক্রিকেট|\bvs\.?\b|বনাম|\bbpl\b|\bipl\b|\bpsl\b|t20|টি-?টোয়েন্টি|\bodi\b|ওয়ানডে|\btest\b|টেস্ট|world cup|বিশ্বকাপ|football|ফুটবল|\bfifa\b|premier league|la ?liga|champions league|\bmatch\b|ম্যাচ|live score|স্কোর|real madrid|barcelona|man(chester)? (united|city)|liverpool|arsenal|messi|ronaldo|neymar|shakib|সাকিব|tamim|তামিম|mushfiq|মুশফিক|taskin|তাসকিন|litton|লিটন|shanto|শান্ত|mustafiz|মুস্তাফিজ|mehidy|মিরাজ|hockey|tennis|badminton|kabaddi|কাবাডি|olympic|অলিম্পিক|\bnba\b|\bf1\b|formula 1/i;
// Movie world, actors and actresses ("showbiz") — checked before general entertainment.
const SHOWBIZ_RE = /movie|film|cinema|সিনেমা|চলচ্চিত্র|ছবির শুটিং|actor|actress|অভিনেতা|অভিনেত্রী|নায়ক|নায়িকা|dhallywood|ঢালিউড|bollywood|বলিউড|tollywood|টালিউড|hollywood|হলিউড|shakib khan|শাকিব খান|box ?office|বক্স অফিস|trailer|ট্রেইলার|teaser|টিজার|premiere|প্রিমিয়ার|শুটিং/i;
// Payment industry, digital banking, wallets.
const FINTECH_RE = /bkash|বিকাশ|nagad|নগদ|rocket|রকেট|upay|উপায়|tallypay|টালিপে|\bmfs\b|mobile financial|মোবাইল ব্যাংকিং|mobile banking|digital bank|ডিজিটাল ব্যাংক|neobank|wallet|ওয়ালেট|e-?wallet|bangla ?qr|বাংলা কিউআর|\bqr\b|কিউআর|payment|পেমেন্ট|cashless|ক্যাশলেস|fintech|ফিনটেক|card payment|কার্ড|transaction|লেনদেন|remittance app|binimoy|বিনিময়|\bnpsb\b|instant payment/i;
// Politics and government.
const POLITICS_RE = /politic|রাজনীতি|রাজনৈতিক|election|নির্বাচন|parliament|সংসদ|minister|মন্ত্রী|উপদেষ্টা|adviser|government|সরকার|party|দল\b|বিএনপি|\bbnp\b|আওয়ামী|awami|জামায়াত|jamaat|এনসিপি|\bncp\b|প্রধানমন্ত্রী|prime minister|president|রাষ্ট্রপতি|ভোট|vote|policy|নীতি/i;
const ENT_RE = /movie|film|সিনেমা|ছবি|নাটক|drama|song|গান|singer|শিল্পী|actor|actress|অভিনেতা|অভিনেত্রী|নায়ক|নায়িকা|ott|chorki|চরকি|netflix|hoichoi|web ?series|ওয়েব সিরিজ|concert|কনসার্ট|tiktok|youtube|ইউটিউব|bollywood|বলিউড|dhallywood|ঢালিউড|shakib khan|শাকিব খান|award|পুরস্কার/i;
const TECH_RE = /iphone|android|samsung|xiaomi|smartphone|স্মার্টফোন|mobile|মোবাইল|\bai\b|chatgpt|gemini|internet|ইন্টারনেট|app\b|অ্যাপ|update|আপডেট|laptop|ল্যাপটপ|google|facebook|whatsapp|5g|starlink|tech|প্রযুক্তি/i;
const BIZ_RE = /price|দাম|মূল্য|dollar|ডলার|taka|টাকা|bank|ব্যাংক|stock|শেয়ার|বাজার|market|budget|বাজেট|salary|বেতন|gold|সোনা|স্বর্ণ|fuel|তেল|গ্যাস|export|রপ্তানি|import|আমদানি|remittance|রেমিট্যান্স|business|ব্যবসা/i;

export function guessCategory(text) {
  const t = String(text || '');
  if (SPORTS_RE.test(t)) return 'sports';
  if (FINTECH_RE.test(t)) return 'fintech';
  if (SHOWBIZ_RE.test(t)) return 'showbiz';
  if (POLITICS_RE.test(t)) return 'politics';
  if (ENT_RE.test(t)) return 'entertainment';
  if (TECH_RE.test(t)) return 'tech';
  if (BIZ_RE.test(t)) return 'business';
  return 'news';
}

export function dhakaDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(d));
}

// pool: [{ title, category, origin: 'trend'|'news', ... }] in source order.
// Returns { ordered, todayCounts, lastCategory, droppedSports }.
export function orderForVariety(pool, posted, { maxSportsPerDay = 1, maxPoliticsPerDay = 1, now = new Date(), limit = 6, categoryWeights = {} } = {}) {
  const today = dhakaDay(now);
  const real = posted.filter((p) => !p.skipped && !p.dryRun && p.postedAt && !Number.isNaN(new Date(p.postedAt).getTime()));
  const todayCounts = {};
  for (const p of real) {
    if (dhakaDay(p.postedAt) === today && p.category) todayCounts[p.category] = (todayCounts[p.category] || 0) + 1;
  }
  const lastCategory = [...real].reverse().find((p) => p.category)?.category || null;
  // daily caps per category (sports and politics)
  const caps = { sports: maxSportsPerDay, politics: maxPoliticsPerDay };
  const full = (cat) => caps[cat] !== undefined && (todayCounts[cat] || 0) >= caps[cat];
  const kept = pool.filter((c) => !full(c.category));
  const droppedSports = pool.filter((c) => c.category === 'sports' && full('sports')).length;
  const droppedPolitics = pool.filter((c) => c.category === 'politics' && full('politics')).length;
  const ordered = kept
    .map((c, i) => ({ c, i }))
    .sort((a, b) =>
      (a.c.category === lastCategory) - (b.c.category === lastCategory) ||
      (todayCounts[a.c.category] || 0) - (todayCounts[b.c.category] || 0) ||
      (categoryWeights[b.c.category] ?? 1) - (categoryWeights[a.c.category] ?? 1) ||
      (a.c.origin === 'trend' ? 0 : 1) - (b.c.origin === 'trend' ? 0 : 1) ||
      a.i - b.i)
    .map(({ c }) => c)
    .slice(0, limit);
  return { ordered, todayCounts, lastCategory, droppedSports, droppedPolitics };
}
