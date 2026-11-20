"""Decides WHAT to post in each slot, following the 'পোস্ট পরিকল্পনা' tab:
morning = the day's series, noon = new idea (DIY / homemade fertiliser), evening = an older topic in a fresh format.
Rotation: least-recently-posted row first; the same row never repeats in the same format within 60 days."""
import datetime as dt
import random
from bangla_date import bangla_month, season

SERIES = {  # Python weekday: Mon=0 … Sun=6
    5: ('calendar', '🗓️ এই মাসে কী লাগাবেন'),
    6: ('fruit', '🌳 ফলের গাছ'),
    0: ('veg', '🥦 মৌসুমি সবজি'),
    1: ('fert_role', '🧪 কোন সারের কী কাজ'),
    2: ('herb', '🌿 ঔষধি ও উপকারী গাছ'),
    3: ('problem', '🐛 সমস্যা ও সমাধান'),
    4: ('media', '🪴 টব, মাটি ও ছাদের যত্ন'),
}
LABELS = {'calendar': 'এই মাসে কী লাগাবেন', 'fruit': 'ফলের গাছ', 'veg': 'মৌসুমি সবজি', 'fert_role': 'কোন সারের কী কাজ',
          'herb': 'ঔষধি ও উপকারী গাছ', 'problem': 'সমস্যা ও সমাধান', 'media': 'টব, মাটি ও ছাদের যত্ন', 'fert_water': 'সার ও পানি',
          'diy': 'আইডিয়া ও DIY', 'homemade': 'ঘরে সার তৈরি'}
CALENDAR_ANGLES = ['এই মাসে কী বুনবেন ও লাগাবেন', 'এই মাসের যত্ন ও বিশেষ টিপস', 'এই মাসে ফলের গাছের কাজ', 'এই মাসে আরও যা লাগানো যায়', 'মাসের শেষ সপ্তাহ: পরের মাসের প্রস্তুতি']
FRUIT_GROUPS = ['বারোমাসি', 'মৌসুমি', 'বিদেশি']
FORMATS = ['৫টি সাধারণ ভুল ও সমাধান', 'প্রশ্ন-উত্তর', 'ভুল ধারণা বনাম সত্য', 'চেকলিস্ট', 'এক লাইনের টিপস (ছোট পোস্ট)', 'তুলনা', 'আজই শুরু করুন — সহজ ধাপে']
REPEAT_DAYS = 60

def slot_for(hour):
    return 'morning' if hour < 11 else 'noon' if hour < 17 else 'evening'

def _last_posted(posted, rid, fmt=None):
    times = [p['date'] for p in posted if p.get('id') == rid and (fmt is None or p.get('format') == fmt)]
    return max(times) if times else ''

def _least_recent(rows, posted, rng):
    if not rows:
        return None
    rows = rows[:]
    rng.shuffle(rows)                      # ties broken randomly
    return min(rows, key=lambda r: _last_posted(posted, r['_id']))

def choose(kb, posted, now: dt.datetime, slot=None, seed=None):
    """Returns dict(slot, tab, label, row, format, angle) or None if nothing is available.
    slot: morning | noon | evening | extra (extra = a fresh topic on demand, any time)."""
    rng = random.Random(seed if seed is not None else now.strftime('%Y%m%d%H'))
    slot = slot or slot_for(now.hour)
    mi, month, mday = bangla_month(now.date())
    cur_season = season(mi)

    if slot == 'morning':
        tab, label = SERIES[now.weekday()]
        rows = kb.get(tab, [])
        angle = ''
        if tab == 'calendar':
            row = next((r for r in rows if r.get('বাংলা মাস') == month), None)
            week = min((mday - 1) // 7, len(CALENDAR_ANGLES) - 1)
            angle = CALENDAR_ANGLES[week]
            if row:
                return dict(slot=slot, tab=tab, label=label, row=row, format='সিরিজ', angle=f'{month} মাস — {angle}')
            tab, label, rows = 'veg', SERIES[0][1], kb.get('veg', [])
        if tab == 'fruit':
            group = FRUIT_GROUPS[(now.isocalendar()[1]) % 3]
            pool = [r for r in rows if r.get('ধরন', '').startswith(group)] or rows
            return _pack(slot, tab, label, _least_recent(pool, posted, rng), 'সিরিজ', f'{group} ফলের গাছ')
        if tab == 'veg':
            pool = [r for r in rows if r.get('মৌসুম') in (cur_season, 'সারা বছর')] or rows
            return _pack(slot, tab, label, _least_recent(pool, posted, rng), 'সিরিজ', f'{cur_season} সবজি ({month} মাস)')
        if tab == 'media':
            rows = rows + kb.get('fert_water', [])
        return _pack(slot, tab, label, _least_recent(rows, posted, rng), 'সিরিজ', angle)

    if slot == 'noon':
        order = ['diy', 'homemade'] if now.toordinal() % 2 == 0 else ['homemade', 'diy']
        for tab in order:
            row = _least_recent(kb.get(tab, []), posted, rng)
            if row:
                return _pack(slot, tab, '💡 ' + LABELS[tab], row, 'আইডিয়া', '')
        return None

    # evening (and extra): any older topic in a fresh format (seasonal vegetables only if in season)
    pool = []
    for tab, rows in kb.items():
        if tab == 'calendar':
            continue
        for r in rows:
            if tab == 'veg' and r.get('মৌসুম') not in (cur_season, 'সারা বছর'):
                continue
            pool.append(r)
    rng.shuffle(pool)
    cutoff = (now - dt.timedelta(days=REPEAT_DAYS)).strftime('%Y-%m-%d')
    candidates = []
    for r in pool:
        fmts = [f for f in FORMATS if _last_posted(posted, r['_id'], f) < cutoff]
        if fmts:
            candidates.append((_last_posted(posted, r['_id']), r, fmts))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    if slot == 'extra':
        # prefer topics never posted at all, then the oldest; a format not used for that topic recently
        candidates.sort(key=lambda x: (x[0] != '', x[0]))
        _, row, fmts = candidates[0]
        return _pack('extra', row['_tab'], '✨ ' + LABELS[row['_tab']], row, rng.choice(fmts), '')
    _, row, fmts = candidates[0]
    return _pack('evening', row['_tab'], '🔁 ' + LABELS[row['_tab']], row, rng.choice(fmts), '')

def _pack(slot, tab, label, row, fmt, angle):
    if not row:
        return None
    return dict(slot=slot, tab=tab, label=label, row=row, format=fmt, angle=angle)
