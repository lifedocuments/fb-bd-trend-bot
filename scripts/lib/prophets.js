// True stories of the prophets (নবী ও রাসূলদের সত্য ঘটনা), one a day.
// Each summary is a short, well-known account from the Quran (or, for a few
// marked "seerah", from the widely accepted life of Prophet Muhammad (সা.)).
// The AI may ONLY retell what is in the summary. Edit freely: add, remove or
// reword entries; keep them short and well established.
export const PROPHET_STORIES = [
  { key: 'adam-repentance', bn: 'হযরত আদম (আ.)-এর তওবা', source: 'সূরা আল-বাকারা ও সূরা আল-আরাফ',
    summary: 'Allah created Adam (AS) and taught him the names of all things. Iblis refused to bow out of pride. Adam and Hawa were tempted, ate from the forbidden tree, then sincerely repented; Allah accepted their repentance. Lesson: admitting a mistake and turning back to Allah.' },
  { key: 'nuh-ark', bn: 'হযরত নূহ (আ.)-এর নৌকা', source: 'সূরা হুদ',
    summary: 'Nuh (AS) called his people to worship Allah alone for a very long time, but most refused and mocked him. By Allah\'s command he built an ark; the believers and pairs of animals boarded before the great flood. Lesson: patience and trust in Allah when people mock you.' },
  { key: 'ibrahim-fire', bn: 'হযরত ইব্রাহিম (আ.) ও আগুন', source: 'সূরা আল-আম্বিয়া',
    summary: 'Ibrahim (AS) broke his people\'s idols to show they could not even protect themselves. His people threw him into a great fire, and Allah commanded the fire to be cool and safe for Ibrahim. Lesson: courage to stand for the truth and trust in Allah.' },
  { key: 'ibrahim-kaaba', bn: 'হযরত ইব্রাহিম (আ.) ও ইসমাইল (আ.)-এর কাবা নির্মাণ', source: 'সূরা আল-বাকারা',
    summary: 'Ibrahim (AS) and his son Ismail (AS) raised the foundations of the Kaaba together, praying that Allah accept their work from them. Lesson: doing good work together and asking Allah to accept it.' },
  { key: 'ibrahim-sacrifice', bn: 'হযরত ইব্রাহিম (আ.)-এর ত্যাগের পরীক্ষা', source: 'সূরা আস-সাফফাত',
    summary: 'Ibrahim (AS) saw in a dream that he was sacrificing his son; both father and son submitted to Allah\'s command. Allah called out to Ibrahim and ransomed the son with a great sacrifice. Muslims remember this at Eid ul-Adha. Lesson: obedience and sacrifice for Allah.' },
  { key: 'hajar-zamzam', bn: 'মা হাজেরা ও জমজম কূপ', source: 'সহিহ হাদিসে বর্ণিত (সাফা-মারওয়া)',
    summary: 'Ibrahim (AS) left his wife Hajar and baby Ismail (AS) in the dry valley of Makkah by Allah\'s command. Hajar ran between the hills of Safa and Marwa searching for water, and Allah brought out the spring of Zamzam. Pilgrims walk between Safa and Marwa in her memory. Lesson: effort plus trust in Allah.' },
  { key: 'yusuf-well', bn: 'হযরত ইউসুফ (আ.) ও তাঁর ভাইয়েরা', source: 'সূরা ইউসুফ',
    summary: 'Yusuf (AS) was thrown into a well by his jealous brothers, sold into Egypt, and later wrongly imprisoned. Through patience and honesty he became a trusted minister of Egypt. When his brothers came for food during a famine, he forgave them. Lesson: patience, honesty and forgiveness.' },
  { key: 'yaqub-patience', bn: 'হযরত ইয়াকুব (আ.)-এর সুন্দর ধৈর্য', source: 'সূরা ইউসুফ',
    summary: 'When Yaqub (AS) lost his beloved son Yusuf (AS), he said that beautiful patience (sabrun jamil) was best, and complained of his grief only to Allah. He never gave up hope, and Allah reunited the family. Lesson: never lose hope in Allah\'s mercy.' },
  { key: 'yusuf-dream-planning', bn: 'হযরত ইউসুফ (আ.) ও দুর্ভিক্ষের প্রস্তুতি', source: 'সূরা ইউসুফ',
    summary: 'Yusuf (AS) explained the king\'s dream: seven years of good harvest would be followed by seven years of drought. He advised storing grain carefully during the good years, and Egypt was saved in the hard years. Lesson: planning and saving in good times for hard times.' },
  { key: 'musa-river', bn: 'শিশু মুসা (আ.) ও নদী', source: 'সূরা আল-কাসাস',
    summary: 'To save baby Musa (AS) from Pharaoh, his mother placed him in a basket on the river by Allah\'s inspiration. He was found by Pharaoh\'s household and raised in the palace, and Allah returned him to his mother to nurse him. Lesson: Allah\'s plan protects in ways we cannot imagine.' },
  { key: 'musa-sea', bn: 'হযরত মুসা (আ.) ও সাগর ভাগ হওয়া', source: 'সূরা আশ-শুআরা',
    summary: 'Pharaoh\'s army chased Musa (AS) and the Children of Israel to the sea. When his people feared being caught, Musa said, "My Lord is with me." By Allah\'s command he struck the sea with his staff and it parted, and the believers crossed safely. Lesson: certainty in Allah\'s help.' },
  { key: 'musa-khidr', bn: 'হযরত মুসা (আ.) ও খিজির (আ.)-এর শিক্ষা', source: 'সূরা আল-কাহফ',
    summary: 'Musa (AS) travelled with a wise servant of Allah to learn from him. He did three things that seemed wrong, and Musa could not stay patient; then the wise man explained the hidden good in each. Lesson: patience and humility, because not everything is as it first appears.' },
  { key: 'yunus-whale', bn: 'হযরত ইউনুস (আ.) ও মাছের পেট', source: 'সূরা আল-আম্বিয়া ও সূরা আস-সাফফাত',
    summary: 'Yunus (AS) left his people in frustration and was swallowed by a great fish. In the darkness he called on Allah, admitting his mistake: "There is no god but You, glory be to You; I was among the wrongdoers." Allah saved him. Lesson: turning to Allah in the darkest moment.' },
  { key: 'ayub-patience', bn: 'হযরত আইয়ুব (আ.)-এর ধৈর্য', source: 'সূরা আল-আম্বিয়া ও সূরা সাদ',
    summary: 'Ayub (AS) was tested with serious illness and the loss of his wealth and family, yet he stayed patient and kept praising Allah. When he called on Allah, Allah removed his hardship and restored his family. Lesson: patience and gratitude in hard times.' },
  { key: 'sulaiman-ant', bn: 'হযরত সুলাইমান (আ.) ও পিঁপড়ার উপত্যকা', source: 'সূরা আন-নামল',
    summary: 'As Sulaiman (AS) and his army approached a valley, an ant warned the other ants to go into their homes so they would not be crushed unknowingly. Sulaiman smiled and thanked Allah for His blessings. Lesson: caring for others and being grateful, even when powerful.' },
  { key: 'sulaiman-sheba', bn: 'হযরত সুলাইমান (আ.) ও সাবার রানী', source: 'সূরা আন-নামল',
    summary: 'A hoopoe bird told Sulaiman (AS) about the Queen of Sheba, whose people worshipped the sun. Sulaiman sent her a letter inviting her to Allah. After seeing the wisdom and signs Allah gave him, she submitted to Allah. Lesson: inviting with wisdom and good words.' },
  { key: 'dawud-jalut', bn: 'হযরত দাউদ (আ.) ও জালুত', source: 'সূরা আল-বাকারা',
    summary: 'A small army of believers faced the huge army of Jalut (Goliath). Young Dawud (AS) defeated Jalut by Allah\'s permission, and Allah later gave him kingship and wisdom. Lesson: a small group with faith and courage can overcome great odds.' },
  { key: 'salih-camel', bn: 'হযরত সালেহ (আ.) ও উটনী', source: 'সূরা হুদ ও সূরা আশ-শামস',
    summary: 'The people of Thamud asked Salih (AS) for a sign, and Allah sent a she-camel, with a turn to drink shared fairly with the people. They were warned not to harm her, but they killed her and refused to repent, and punishment came. Lesson: keeping promises and respecting what is entrusted to us.' },
  { key: 'hud-aad', bn: 'হযরত হুদ (আ.) ও আদ জাতি', source: 'সূরা হুদ',
    summary: 'The people of Aad were strong and built great buildings, but they became arrogant. Hud (AS) called them to worship Allah and ask forgiveness, promising more blessings. They refused out of pride. Lesson: strength and wealth are blessings, not reasons for pride.' },
  { key: 'shuaib-weights', bn: 'হযরত শুয়াইব (আ.) ও সৎ মাপ-ওজন', source: 'সূরা হুদ',
    summary: 'Shuaib (AS) was sent to the people of Madyan, who cheated in trade by giving short measure and weight. He told them to give full measure and weight with justice and not to cheat people of their things. Lesson: honesty in buying and selling.' },
  { key: 'zakariya-prayer', bn: 'হযরত যাকারিয়া (আ.)-এর দোয়া', source: 'সূরা মারইয়াম',
    summary: 'Zakariya (AS) was old and had no child. He quietly prayed to Allah, never having been disappointed in calling on Him. Allah gave him the good news of a son, Yahya (AS). Lesson: never stop praying, whatever your age or situation.' },
  { key: 'isa-cradle', bn: 'দোলনা থেকে হযরত ঈসা (আ.)-এর কথা', source: 'সূরা মারইয়াম',
    summary: 'When people questioned Maryam (AS) about her baby, she pointed to him, and baby Isa (AS) spoke from the cradle by Allah\'s permission, saying he was the servant of Allah and a prophet, defending his mother\'s honour. Lesson: Allah defends the honour of the innocent.' },
  { key: 'muhammad-hira', bn: 'হেরা গুহায় প্রথম ওহী', source: 'সূরা আল-আলাক',
    summary: 'Prophet Muhammad (SAW) used to reflect in the cave of Hira. There the first revelation came: "Read in the name of your Lord who created." The first command of the Quran was to read. Lesson: the importance of reading and learning.' },
  { key: 'muhammad-al-amin', bn: 'আল-আমিন: বিশ্বস্ত ব্যবসায়ী মুহাম্মদ (সা.)', source: 'সিরাত (নবী জীবনী)',
    summary: 'Even before prophethood, Muhammad (SAW) was known in Makkah as Al-Amin, "the trustworthy". He traded honestly, and people trusted him with their valuables. Lesson: honesty and trust are the real capital of any business.' },
  { key: 'muhammad-cave-thawr', bn: 'হিজরত ও সাওর গুহা', source: 'সূরা আত-তাওবা',
    summary: 'During the migration from Makkah to Madinah, Prophet Muhammad (SAW) and Abu Bakr (RA) hid in a cave while enemies searched nearby. The Prophet said, "Do not grieve, Allah is with us." They reached safety. Lesson: calm trust in Allah during danger.' }
];

// Calm, non-figurative photos only — never people, never depictions of prophets.
export const STORY_IMAGE_QUERIES = ['desert dunes sunset', 'night sky stars', 'old book pages', 'lantern light dark', 'mosque silhouette sunset', 'calm sea horizon', 'mountain sunrise mist', 'palm trees desert'];

/** Next story not used recently (rotates through the whole list). */
export function nextProphetStory(posted) {
  const used = posted.filter((p) => p.story).map((p) => p.story);
  const recent = new Set(used.slice(-(PROPHET_STORIES.length - 1)));
  return PROPHET_STORIES.find((s) => !recent.has(s.key)) || PROPHET_STORIES[0];
}
