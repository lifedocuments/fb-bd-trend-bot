"""Gemini writes the Bangla post ONLY from the knowledge-base row it is given."""
import json, os, re, time
import requests

PAGE = 'Roof Oxygen Factory'
HASHTAGS = '#RoofOxygenFactory #ছাদবাগান'
SYSTEM = f"""তুমি "{PAGE}" ফেসবুক পেজের লেখক — বাংলাদেশের ছাদবাগানিদের জন্য সহজ, আন্তরিক বাংলায় লেখো।
কঠোর নিয়ম:
- শুধু দেওয়া "তথ্য" থেকে লিখবে। নতুন তথ্য, সংখ্যা, মাত্রা, জাতের নাম, সময় বা দাবি বানাবে না।
- কোনো দাম বা টাকার উল্লেখ নয়।
- রাসায়নিক সার বা কীটনাশকের মাত্রা/নাম দেবে না; প্রয়োজনে লিখবে "কৃষি অফিসের পরামর্শ নিন"।
- ঔষধি গাছ হলে শুধু প্রচলিত ঘরোয়া ব্যবহার বলবে, রোগ সারানোর দাবি নয়; শেষে লিখবে "অসুস্থতায় চিকিৎসকের পরামর্শ নিন"।
- জৈব পদ্ধতি আগে। ছাদের নিরাপত্তা প্রাসঙ্গিক হলে মনে করিয়ে দেবে।
- কোনো সম্ভাষণ (নমস্কার, আসসালামু আলাইকুম, হ্যালো, প্রিয় বন্ধুরা) দিয়ে শুরু করবে না — প্রথম লাইনেই সরাসরি বিষয়।
- ছোট অনুচ্ছেদ, ১–২টি ইমোজি, ১০০–১৮০ শব্দ (এক লাইনের টিপস হলে ৪০–৭০ শব্দ)। শেষে একটি সহজ প্রশ্ন বা টিপস।
- পোস্টের শেষে এই হ্যাশট্যাগ এবং বিষয়ের সাথে মিলিয়ে আরও ১টি বাংলা হ্যাশট্যাগ: {HASHTAGS}
উত্তর শুধু JSON:
{{"caption": "পুরো ফেসবুক পোস্ট", "card_title": "কার্ডের শিরোনাম (সর্বোচ্চ ৮ শব্দ)", "card_points": ["কার্ডে ২–৪টি ছোট লাইন, প্রতিটি সর্বোচ্চ ৯ শব্দ, শুধু তথ্য থেকে"],
 "image_query": "ছবি খোঁজার জন্য ইংরেজিতে নির্দিষ্ট শব্দ, যেমন 'guava fruit tree', 'cauliflower plant', 'bamboo trellis vegetable garden'",
 "image_query_alt": "আরেকটি ইংরেজি বা বৈজ্ঞানিক নাম, যেমন 'Psidium guajava'"}}"""

def _prompt(pick):
    facts = '\n'.join(f'- {k}: {v}' for k, v in pick['row'].items() if not k.startswith('_') and v)
    how = {
        'সিরিজ': f'সিরিজ: {pick["label"]}। {pick["angle"]}'.strip(),
        'আইডিয়া': f'দুপুরের আইডিয়া পোস্ট ({pick["label"]}) — ধাপে ধাপে, যেন আজই করা যায়।',
    }.get(pick['format'], f'পুরনো বিষয় নতুন ভঙ্গিতে — ভঙ্গি: "{pick["format"]}"। ({pick["label"]})')
    return f'পোস্টের ধরন: {how}\n\nতথ্য (শুধু এখান থেকে লিখবে):\n{facts}'

def write(pick, api_key=None, models=None, tries=3):
    api_key = api_key or os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY is not set')
    models = models or [os.environ.get('GEMINI_MODEL') or 'gemini-flash-latest', 'gemini-flash-lite-latest']
    body = {'systemInstruction': {'parts': [{'text': SYSTEM}]}, 'contents': [{'role': 'user', 'parts': [{'text': _prompt(pick)}]}],
            'generationConfig': {'temperature': 0.7, 'responseMimeType': 'application/json', 'maxOutputTokens': 4096}}
    last = None
    for attempt in range(tries):
        model = models[min(attempt, len(models) - 1)]
        try:
            r = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                              headers={'x-goog-api-key': api_key}, json=body, timeout=90)
            if r.status_code != 200:
                last = f'Gemini HTTP {r.status_code}: {r.text[:200]}'
                time.sleep(10 if r.status_code in (429, 500, 503) else 1)
                continue
            parts = r.json()['candidates'][0]['content']['parts']
            text = ''.join(p.get('text', '') for p in parts if not p.get('thought'))
            data = json.loads(text[text.index('{'): text.rindex('}') + 1])
            return check(data)
        except Exception as e:  # noqa: BLE001
            last = str(e)
            time.sleep(3)
    raise RuntimeError(last or 'Gemini failed')

GREET = r'(নমস্কার|নমষ্কার|আসসালামু\s*আলাইকুম|আস-সালামু\s*আলাইকুম|আসসালামু|সালাম|হ্যালো|হাই|শুভ\s*(সকাল|দুপুর|সন্ধ্যা|বিকাল|রাত্রি)|প্রিয়\s*(ছাদবাগানি\s*)?(বন্ধুরা|বন্ধু))'
GREET_RE = re.compile(r'^[\s\W_]*' + GREET + r'(?=[\s!।?,]|$)(?:[^\n!।?,]{0,40}[!।?,]|(?=\s*$))\s*', re.UNICODE)   # the whole greeting phrase up to its ! । ? ,
GREET_SHORT_RE = re.compile(r'^[\s\W_]*' + GREET + r'(?=[\s!।?,]|$)\s*', re.UNICODE)

def strip_greetings(cap):
    """Removes greeting words at the start of any line (with or without emojis before them)."""
    out = []
    for line in cap.split('\n'):
        new = line
        for _ in range(2):                      # e.g. "নমস্কার! প্রিয় বন্ধুরা, ..."
            m = GREET_RE.match(new) or GREET_SHORT_RE.match(new)
            if not m:
                break
            new = new[m.end():]
        if new.strip() or not line.strip():
            out.append(new)
    return '\n'.join(out).strip()

PRICE_RE = re.compile(r'(৳|টাকা|\bTk\b|\bBDT\b|দাম)', re.I)

def check(d):
    cap = str(d.get('caption', '')).strip()
    if len(cap) < 40:
        raise ValueError('caption too short')
    if PRICE_RE.search(cap):
        cap = '\n'.join(l for l in cap.split('\n') if not PRICE_RE.search(l))   # safety net: no prices
    cap = strip_greetings(cap)
    for tag in HASHTAGS.split():
        if tag not in cap:
            cap = cap.rstrip() + ' ' + tag if cap.rstrip().split('\n')[-1].startswith('#') else cap.rstrip() + '\n\n' + tag
    pts = [str(p).strip() for p in (d.get('card_points') or []) if str(p).strip() and not PRICE_RE.search(str(p))][:4]
    return {'caption': cap, 'card_title': str(d.get('card_title', '')).strip()[:60], 'card_points': pts,
            'image_query': str(d.get('image_query', '')).strip(), 'image_query_alt': str(d.get('image_query_alt', '')).strip()}
