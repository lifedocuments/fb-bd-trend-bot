#!/usr/bin/env python3
"""Draws a branded 1080x1350 "photocard" for a Facebook post.

Reads one JSON object on stdin:
  {"out": "card.png", "headline": "...", "photo": "photo.jpg" or "",
   "label": "ট্রেন্ডিং", "page_name": "Sakin Mart Bangladesh",
   "date_text": "১১ অক্টোবর ২০২৬", "tag": "#SakinMartBD",
   "credit": "Photo: Name / Unsplash", "mood": "normal" | "solemn"}

With "format": "reel", writes two 1080x1920 layers instead, for a Reel:
  "out_bg" (photo or design background) and "out_overlay" (transparent PNG
  with label, headline and brand), kept inside the area that Facebook's
  Reel buttons and caption don't cover.

Exit codes: 0 = card written; 3 = Bangla text shaping unavailable (caller
must fall back to a plain photo, never post broken Bangla); other = error.
Fonts: Hind Siliguri and Poppins, both SIL Open Font License (assets/fonts).
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont, ImageOps, features

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'assets', 'fonts')
W, H = 1080, 1350
PHOTO_H = 770
GREEN, DEEP = (0, 106, 78), (0, 58, 43)
RED, WHITE, CREAM = (244, 42, 65), (255, 255, 255), (255, 244, 214)
GREY_DEEP = (32, 36, 40)

def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size, layout_engine=ImageFont.Layout.RAQM)

def clean(text):
    # Keep Bangla, Latin, digits and common punctuation; drop emoji the font can't draw.
    ok = []
    for ch in text:
        o = ord(ch)
        if o < 0x250 or 0x0980 <= o <= 0x09FF or ch in '\u200c\u200d‘’“”–—…৳।':
            ok.append(ch)
    return re.sub(r'\s+', ' ', ''.join(ok)).strip()

def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(' '), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def gradient(w, h, c1, c2):
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return im

def main():
    if not features.check('raqm'):
        print('Bangla text shaping (raqm) not available', file=sys.stderr)
        sys.exit(3)
    cfg = json.load(sys.stdin)
    solemn = cfg.get('mood') == 'solemn'
    panel_top, panel_bot = (GREY_DEEP, (14, 16, 18)) if solemn else (DEEP, (0, 40, 30))
    accent = (200, 200, 200) if solemn else RED

    card = Image.new('RGB', (W, H), panel_bot)

    # --- photo area ---
    photo_path = cfg.get('photo') or ''
    if photo_path and os.path.exists(photo_path):
        ph = Image.open(photo_path).convert('RGB')
        ph = ImageOps.fit(ph, (W, PHOTO_H), Image.LANCZOS, centering=(0.5, 0.45))
        if solemn: ph = ImageOps.grayscale(ph).convert('RGB')
    else:
        ph = gradient(W, PHOTO_H, GREEN, DEEP) if not solemn else gradient(W, PHOTO_H, (60, 64, 68), GREY_DEEP)
        if not solemn:
            d = ImageDraw.Draw(ph); r = 240
            d.ellipse([W / 2 - r, PHOTO_H / 2 - r, W / 2 + r, PHOTO_H / 2 + r], fill=accent)
    card.paste(ph, (0, 0))
    # fade the bottom of the photo into the panel
    fade = Image.new('RGB', (W, 220), panel_top)
    mask = Image.linear_gradient('L').resize((W, 220))
    card.paste(fade, (0, PHOTO_H - 220), mask)

    d = ImageDraw.Draw(card)
    # panel
    d.rectangle([0, PHOTO_H, W, H], fill=panel_top)
    d.rectangle([0, PHOTO_H, W, PHOTO_H + 8], fill=accent)

    # label chip
    label = clean(cfg.get('label') or '')
    if label:
        lf = font('HindSiliguri-SemiBold.ttf', 38)
        lw = d.textlength(label, font=lf)
        d.rounded_rectangle([44, 44, 44 + lw + 56, 44 + 70], radius=35, fill=accent if not solemn else (90, 94, 98))
        d.text((44 + 28, 44 + 8), label, font=lf, fill=WHITE)

    # photo credit
    credit = clean(cfg.get('credit') or '')
    if credit and photo_path:
        cf = font('HindSiliguri-SemiBold.ttf', 24)
        cw = d.textlength(credit, font=cf)
        x, y = W - cw - 30, PHOTO_H - 50
        d.text((x + 1, y + 1), credit, font=cf, fill=(0, 0, 0))
        d.text((x, y), credit, font=cf, fill=(235, 235, 235))

    # headline: largest size that fits in 3 lines
    headline = clean(cfg.get('headline') or '')
    max_w, box_top, box_bot = W - 120, PHOTO_H + 40, H - 175
    for size in range(84, 43, -4):
        hf = font('HindSiliguri-Bold.ttf', size)
        lines = wrap(d, headline, hf, max_w)
        line_h = int(size * 1.38)
        if len(lines) <= 3 and line_h * len(lines) <= box_bot - box_top:
            break
    else:
        lines = lines[:3]
        if lines: lines[-1] = lines[-1].rstrip(' ,।') + '…'
    total = line_h * len(lines)
    y = box_top + (box_bot - box_top - total) / 2
    for ln in lines:
        d.text((60, y), ln, font=hf, fill=WHITE)
        y += line_h

    # footer: logo, page name, date, brand tag
    fy = H - 130
    d.line([(60, fy - 22), (W - 60, fy - 22)], fill=(255, 255, 255, 60), width=1)
    lr = 42; lcx, lcy = 60 + lr, fy + 45
    d.ellipse([lcx - lr, lcy - lr, lcx + lr, lcy + lr], fill=GREEN if not solemn else (70, 74, 78))
    d.ellipse([lcx - 30, lcy - 30, lcx + 30, lcy + 30], fill=accent)
    sm = ImageFont.truetype(os.path.join(FONTS, 'Poppins-Bold.ttf'), 30)
    b = d.textbbox((0, 0), 'SM', font=sm)
    d.text((lcx - (b[2] - b[0]) / 2 - b[0], lcy - (b[3] - b[1]) / 2 - b[1]), 'SM', font=sm, fill=WHITE)
    nf = ImageFont.truetype(os.path.join(FONTS, 'Poppins-Bold.ttf'), 30)
    d.text((lcx + lr + 22, fy + 6), clean(cfg.get('page_name') or ''), font=nf, fill=WHITE)
    df = font('HindSiliguri-SemiBold.ttf', 28)
    d.text((lcx + lr + 22, fy + 48), clean(cfg.get('date_text') or ''), font=df, fill=CREAM)
    tag = clean(cfg.get('tag') or '')
    if tag:
        tf = ImageFont.truetype(os.path.join(FONTS, 'Poppins-Bold.ttf'), 28)
        tw = d.textlength(tag, font=tf)
        d.text((W - 60 - tw, fy + 28), tag, font=tf, fill=CREAM)

    card.save(cfg['out'], 'PNG', optimize=True)
    print(cfg['out'])

RW, RH = 1080, 1920

def render_reel(cfg):
    solemn = cfg.get('mood') == 'solemn'
    accent = (200, 200, 200) if solemn else RED
    # background
    photo_path = cfg.get('photo') or ''
    if photo_path and os.path.exists(photo_path):
        bg = Image.open(photo_path).convert('RGB')
        bg = ImageOps.fit(bg, (RW, RH), Image.LANCZOS, centering=(0.5, 0.4))
        if solemn: bg = ImageOps.grayscale(bg).convert('RGB')
    else:
        bg = gradient(RW, RH, GREEN, DEEP) if not solemn else gradient(RW, RH, (60, 64, 68), GREY_DEEP)
        if not solemn:
            d = ImageDraw.Draw(bg); r = 300
            d.ellipse([RW / 2 - r, 620 - r, RW / 2 + r, 620 + r], fill=accent)
    bg.save(cfg['out_bg'], 'PNG')

    # overlay (transparent)
    ov = Image.new('RGBA', (RW, RH), (0, 0, 0, 0))
    shade = Image.new('RGBA', (RW, RH), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    base = (20, 22, 24) if solemn else (0, 40, 30)
    for y in range(640, RH):
        a = min(240, int((y - 640) / 520 * 240))
        sd.line([(0, y), (RW, y)], fill=base + (a,))
    ov = Image.alpha_composite(ov, shade)
    d = ImageDraw.Draw(ov)

    label = clean(cfg.get('label') or '')
    if label:
        lf = font('HindSiliguri-SemiBold.ttf', 46)
        lw = d.textlength(label, font=lf)
        d.rounded_rectangle([60, 250, 60 + lw + 64, 250 + 84], radius=42, fill=accent + (255,) if not solemn else (90, 94, 98, 255))
        d.text((60 + 32, 250 + 10), label, font=lf, fill=WHITE)

    headline = clean(cfg.get('headline') or '')
    max_w, top, bot = 780, 1000, 1360
    for size in range(96, 51, -4):
        hf = font('HindSiliguri-Bold.ttf', size)
        lines = wrap(d, headline, hf, max_w)
        lh = int(size * 1.36)
        if len(lines) <= 4 and lh * len(lines) <= bot - top:
            break
    else:
        lines = lines[:4]
        if lines: lines[-1] = lines[-1].rstrip(' ,।') + '…'
    y = bot - lh * len(lines)
    d.rectangle([60, y + 8, 70, bot - 8], fill=accent + (255,))
    for ln in lines:
        d.text((96, y), ln, font=hf, fill=WHITE)
        y += lh

    fy = 1400
    lr = 46; lcx, lcy = 60 + lr, fy + lr
    d.ellipse([lcx - lr, lcy - lr, lcx + lr, lcy + lr], fill=(GREEN if not solemn else (70, 74, 78)) + (255,))
    d.ellipse([lcx - 33, lcy - 33, lcx + 33, lcy + 33], fill=accent + (255,))
    sm = ImageFont.truetype(os.path.join(FONTS, 'Poppins-Bold.ttf'), 32)
    b = d.textbbox((0, 0), 'SM', font=sm)
    d.text((lcx - (b[2] - b[0]) / 2 - b[0], lcy - (b[3] - b[1]) / 2 - b[1]), 'SM', font=sm, fill=WHITE)
    nf = ImageFont.truetype(os.path.join(FONTS, 'Poppins-Bold.ttf'), 32)
    d.text((lcx + lr + 22, fy + 4), clean(cfg.get('page_name') or ''), font=nf, fill=WHITE)
    d.text((lcx + lr + 22, fy + 48), clean(cfg.get('date_text') or ''), font=font('HindSiliguri-SemiBold.ttf', 30), fill=CREAM)

    credit = clean(cfg.get('credit') or '')
    if credit and photo_path:
        cf = font('HindSiliguri-SemiBold.ttf', 26)
        d.text((60, 345 + 20), credit, font=cf, fill=(235, 235, 235, 230))
    ov.save(cfg['out_overlay'], 'PNG')
    print(cfg['out_overlay'])

if __name__ == '__main__':
    if not features.check('raqm'):
        print('Bangla text shaping (raqm) not available', file=sys.stderr)
        sys.exit(3)
    _cfg = json.load(sys.stdin)
    if _cfg.get('format') == 'reel':
        render_reel(_cfg)
    else:
        sys.stdin = __import__('io').StringIO(json.dumps(_cfg))
        main()
