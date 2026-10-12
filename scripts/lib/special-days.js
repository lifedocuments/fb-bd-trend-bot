// Special days for Bangladesh. On these dates the first run of the day posts
// a special-day post before any trend. Dates are Bangladesh time.
//
// mood: 'festive' | 'proud' | 'solemn' | 'warm'
//   solemn days get a grey, respectful card with no emoji and no questions.
//
// Lunar festivals (Eid, Durga Puja, Shab-e-Barat, ...) move every year and
// in Bangladesh depend on moon sighting, so they are NOT guessed here. Once
// the official date is announced, add a line to DATED_DAYS below, e.g.
//   { date: '2027-03-10', name: 'Eid ul-Fitr', bn: 'ঈদুল ফিতর', mood: 'festive', note: 'Eid Mubarak greeting to all readers' },

export const FIXED_DAYS = [
  { md: '02-14', name: 'Pohela Falgun (spring festival)', bn: 'পহেলা ফাল্গুন', mood: 'festive', note: 'Welcome spring: colours, flowers, yellow outfits, Basanta Utsab' },
  { md: '02-21', name: 'Shaheed Dibosh and International Mother Language Day', bn: 'শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস', mood: 'solemn', note: 'Respectful tribute to the 1952 Language Movement martyrs and love for Bangla' },
  { md: '03-08', name: 'International Women\'s Day', bn: 'আন্তর্জাতিক নারী দিবস', mood: 'warm', note: 'Respect and appreciation for women in families, work and society' },
  { md: '03-25', name: 'Genocide Remembrance Day', bn: 'গণহত্যা দিবস', mood: 'solemn', note: 'Respectful remembrance of the night of 25 March 1971' },
  { md: '03-26', name: 'Independence Day', bn: 'স্বাধীনতা দিবস', mood: 'proud', note: 'Pride in Bangladesh, gratitude to the freedom fighters' },
  { md: '04-14', name: 'Pohela Boishakh (Bangla New Year)', bn: 'পহেলা বৈশাখ', mood: 'festive', note: 'Shubho Noboborsho: panta-ilish, red-white outfits, Boishakhi fairs' },
  { md: '05-01', name: 'May Day', bn: 'মে দিবস', mood: 'warm', note: 'Respect for workers and everyone who keeps the country running' },
  { md: '12-14', name: 'Martyred Intellectuals Day', bn: 'শহীদ বুদ্ধিজীবী দিবস', mood: 'solemn', note: 'Respectful remembrance of the intellectuals killed in 1971' },
  { md: '12-16', name: 'Victory Day', bn: 'বিজয় দিবস', mood: 'proud', note: 'Celebrating victory in 1971, red-green pride, gratitude to freedom fighters' }
];

// Days that fall on "the Nth <weekday> of a month".
export const WEEKDAY_DAYS = [
  { month: 5, weekday: 0, nth: 2, name: 'Mother\'s Day', bn: 'মা দিবস', mood: 'warm', note: 'Love and gratitude for mothers' },
  { month: 6, weekday: 0, nth: 3, name: 'Father\'s Day', bn: 'বাবা দিবস', mood: 'warm', note: 'Love and gratitude for fathers' }
];

// One-off dated entries (add lunar festivals here once dates are announced).
export const DATED_DAYS = [];

function dhakaParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { ymd: `${p.year}-${p.month}-${p.day}`, md: `${p.month}-${p.day}`, month: Number(p.month), day: Number(p.day), weekday };
}

// Returns { key, name, bn, mood, note } for today in Bangladesh, or null.
export function specialDayFor(date = new Date()) {
  const t = dhakaParts(date);
  const hit =
    DATED_DAYS.find((d) => d.date === t.ymd) ||
    FIXED_DAYS.find((d) => d.md === t.md) ||
    WEEKDAY_DAYS.find((d) => d.month === t.month && d.weekday === t.weekday && Math.ceil(t.day / 7) === d.nth);
  return hit ? { key: `${t.ymd} ${hit.name}`, ...hit } : null;
}
