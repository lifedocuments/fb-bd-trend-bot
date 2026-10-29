#!/usr/bin/env python3
"""Draws the 1080x1350 "আজকের বাজারদর" price card.

stdin JSON: {"out": "card.jpg", "title": "আজকের বাজারদর", "date_text": "ঢাকা · ২৮ অক্টোবর ২০২৬",
             "rows": [{"name": "চাল (মোটা)", "unit": "কেজি", "price": "৳৫০–৫৫", "trend": "up"|"down"|"same"|""}],
             "source": "উৎস: টিসিবি", "note": "▲▼ গত সপ্তাহের তুলনায়", "page_name": "...", "tag": "#SakinMartBD"}
Exit 0 = written, 3 = Bangla shaping unavailable (caller must not post broken Bangla).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont, features

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'assets', 'fonts')
W, H = 1080, 1350
GREEN, DEEP = (0, 106, 78), (0, 58, 43)
CREAM, WHITE, INK, SOFT = (255, 248, 230), (255, 255, 255), (28, 34, 32), (95, 106, 102)
UP, DOWN, SAME = (214, 48, 49), (0, 140, 90), (150, 150, 150)

def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size, layout_engine=ImageFont.Layout.RAQM)

def main():
    data = json.load(sys.stdin)
    if not features.check('raqm'):
        sys.exit(3)
    rows = data.get('rows', [])[:12]
    img = Image.new('RGB', (W, H), WHITE)
    d = ImageDraw.Draw(img)
    # header
    d.rectangle([0, 0, W, 250], fill=GREEN)
    d.rectangle([0, 238, W, 250], fill=DEEP)
    f_pill = font('HindSiliguri-Bold.ttf', 30)
    d.rounded_rectangle([60, 46, 60 + d.textlength('দৈনিক দ্রব্যমূল্য', font=f_pill) + 40, 96], radius=25, fill=WHITE)
    d.text((80, 50), 'দৈনিক দ্রব্যমূল্য', font=f_pill, fill=GREEN)
    d.text((60, 104), data.get('title', 'আজকের বাজারদর'), font=font('HindSiliguri-Bold.ttf', 78), fill=WHITE)
    d.text((62, 196), data.get('date_text', ''), font=font('HindSiliguri-SemiBold.ttf', 32), fill=CREAM)
    # column heads
    top, bottom = 280, 1200
    f_head = font('HindSiliguri-SemiBold.ttf', 28)
    d.text((60, top), 'পণ্য', font=f_head, fill=SOFT)
    d.text((W - 160, top), 'দাম (৳)', font=f_head, fill=SOFT, anchor='ra')
    y0 = top + 50
    n = max(len(rows), 1)
    rh = min(100, (bottom - y0) // n)
    f_name = font('HindSiliguri-SemiBold.ttf', min(38, int(rh * 0.5)))
    f_unit = font('HindSiliguri-SemiBold.ttf', min(26, int(rh * 0.36)))
    f_price = font('HindSiliguri-Bold.ttf', min(40, int(rh * 0.52)))
    for i, r in enumerate(rows):
        y = y0 + i * rh
        if i % 2 == 0:
            d.rectangle([40, y, W - 40, y + rh], fill=CREAM)
        cy = y + rh // 2
        d.text((60, cy), r.get('name', ''), font=f_name, fill=INK, anchor='lm')
        price = r.get('price', '')
        d.text((W - 160, cy), price, font=f_price, fill=INK, anchor='rm')
        d.text((W - 150, cy + 2), '/' + r.get('unit', ''), font=f_unit, fill=SOFT, anchor='lm')
        t = r.get('trend', '')
        ax = W - 62
        if t == 'up':
            d.polygon([(ax - 14, cy + 9), (ax + 14, cy + 9), (ax, cy - 13)], fill=UP)
        elif t == 'down':
            d.polygon([(ax - 14, cy - 9), (ax + 14, cy - 9), (ax, cy + 13)], fill=DOWN)
        elif t == 'same':
            d.ellipse([ax - 7, cy - 7, ax + 7, cy + 7], fill=SAME)
    # footer
    d.rectangle([0, 1222, W, H], fill=DEEP)
    f_foot = font('HindSiliguri-SemiBold.ttf', 26)
    d.text((60, 1246), data.get('source', ''), font=f_foot, fill=CREAM)
    note = data.get('note', '')
    if note:
        d.text((60, 1286), note, font=f_foot, fill=(200, 225, 215))
    d.text((W - 60, 1246), data.get('page_name', ''), font=font('HindSiliguri-Bold.ttf', 28), fill=WHITE, anchor='ra')
    d.text((W - 60, 1286), data.get('tag', ''), font=font('Poppins-Bold.ttf', 26), fill=CREAM, anchor='ra')
    out = data['out']
    img.save(out, quality=92) if out.lower().endswith('.jpg') else img.save(out)

if __name__ == '__main__':
    main()
