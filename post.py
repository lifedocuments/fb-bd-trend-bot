"""Roof Oxygen Factory — one post per run. Usage: python bot/post.py [--slot morning|noon|evening] [--dry-run]"""
import argparse, datetime as dt, json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kb as kbmod, plan, writer, images, card, publish

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOG = os.path.join(ROOT, 'data', 'posted.json')
BD = dt.timezone(dt.timedelta(hours=6))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--slot', default=os.environ.get('SLOT') or '')
    ap.add_argument('--dry-run', action='store_true', default=str(os.environ.get('DRY_RUN', '')).lower() == 'true')
    a = ap.parse_args()
    now = dt.datetime.now(BD)
    slot = a.slot if a.slot in ('morning', 'noon', 'evening', 'extra') else plan.slot_for(now.hour)
    max_extra = int(os.environ.get('MAX_EXTRA_PER_DAY') or 3)
    posted = json.load(open(LOG, encoding='utf-8')) if os.path.exists(LOG) else []
    today = now.strftime('%Y-%m-%d')
    if slot == 'extra':
        done = sum(1 for p in posted if p.get('date') == today and p.get('slot') == 'extra')
        if not a.dry_run and done >= max_extra:
            print(f'[roof] Safety limit: {done} extra post(s) already today (MAX_EXTRA_PER_DAY={max_extra}) — not posting another.')
            publish.telegram(f'ℹ️ Roof Oxygen Factory: extra post not sent — {done} extra post(s) already today (limit {max_extra}).')
            return 0
    elif not a.dry_run and any(p.get('date') == today and p.get('slot') == slot for p in posted):
        print(f'[roof] {slot} post already published today — nothing to do.')
        return 0

    kb = kbmod.load(os.path.join(ROOT, 'knowledge', 'knowledge-base.xlsx'))
    if not sum(len(v) for v in kb.values()):
        publish.telegram('⚠️ Roof Oxygen Factory: no rows marked "যাচাই হয়েছে" in the knowledge base — nothing to post.')
        print('[roof] No checked rows in the knowledge base.'); return 1
    pick = plan.choose(kb, posted, now, slot)
    if not pick:
        print('[roof] Nothing new to post for this slot.'); return 0
    print(f'[roof] Slot: {slot} · {pick["label"]} · {pick["row"]["_id"]} · format: {pick["format"]} {pick["angle"]}')

    post = writer.write(pick)
    print('[roof] Caption:\n' + post['caption'])
    tmp = tempfile.mkdtemp()
    used_own = [p.get('photo') for p in posted if p.get('photo')]
    photo = images.find(pick['row'], post['image_query'], post['image_query_alt'], os.path.join(tmp, 'photo.jpg'), os.path.join(ROOT, 'photos'), used_own)
    print(f'[roof] Photo: {photo["path"] if photo else "none (designed card only)"} {photo["credit"] if photo else ""}')
    label = pick['label'].split(' ', 1)[-1] if pick['label'][0] in '🗓🌳🥦🧪🌿🐛🪴💡🔁✨' else pick['label']
    out = card.draw(os.path.join(tmp, 'post.jpg'), label, post['card_title'] or label, post['card_points'],
                    photo['path'] if photo else None, (photo or {}).get('credit', ''))
    caption = post['caption'] + (f"\n\n📷 {photo['credit'].replace('ছবি: ', '')}" if photo and photo.get('credit') else '')
    if a.dry_run:
        print(f'[roof] DRY RUN — card saved at {out}, not posting.')
        return 0
    try:
        post_id = publish.via_make(caption, out)
    except Exception as e:  # noqa: BLE001
        publish.telegram(f'⚠️ Roof Oxygen Factory: post not published — {e}')
        raise
    posted.append({'date': today, 'time': now.strftime('%H:%M'), 'slot': slot, 'id': pick['row']['_id'], 'tab': pick['tab'],
                   'format': pick['format'], 'title': post['card_title'], 'post_id': post_id, 'photo': (photo or {}).get('own', '')})
    json.dump(posted[-2000:], open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    publish.telegram(f'✅ Roof Oxygen Factory · {pick["label"]}\n{post["card_title"]}\nhttps://www.facebook.com/{post_id}')
    print(f'[roof] Published: {post_id}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
