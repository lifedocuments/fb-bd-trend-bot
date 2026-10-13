// Publishing through a Make.com scenario instead of our own Meta app.
// Use this when the Meta app can't go Live (no business verification): Make's
// own Facebook connection is approved by Meta, so its posts are public.
//
// The bot POSTs JSON to your Make webhook:
//   { secret, kind: "photo"|"text", caption, image_base64, image_name, comment }
// and the scenario publishes it (and the comment), then answers with
//   {"post_id": "...", "id": "..."}  via a "Webhook response" module.
import { readFile } from 'node:fs/promises';

export function makeEnabled() {
  const pub = (process.env.PUBLISHER || '').toLowerCase();
  return !!process.env.MAKE_WEBHOOK_URL && pub !== 'graph';
}

async function toBase64({ imagePath, imageUrl }) {
  if (imagePath) return (await readFile(imagePath)).toString('base64');
  if (imageUrl) {
    const res = await fetch(imageUrl);
    if (res.ok) return Buffer.from(await res.arrayBuffer()).toString('base64');
  }
  return '';
}

export async function publishViaMake({ caption, imagePath, imageUrl, comment = '' }) {
  const image_base64 = await toBase64({ imagePath, imageUrl });
  const kind = image_base64 ? 'photo' : 'text';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.MAKE_TIMEOUT_MS || 120000));
  let res, text;
  try {
    res = await fetch(process.env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.MAKE_SHARED_SECRET || '',
        kind, caption, comment,
        image_base64, image_name: imagePath && /\.png$/i.test(imagePath) ? 'photocard.png' : 'photocard.jpg'
      }),
      signal: controller.signal
    });
    text = await res.text();
  } catch (e) {
    throw new Error(`Make.com webhook did not answer: ${e.name === 'AbortError' ? 'timed out' : e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Make.com webhook returned HTTP ${res.status}: ${String(text).slice(0, 200)}`);
  let data = {};
  try { data = JSON.parse(text); } catch {
    console.warn(`[make] Webhook answered "${String(text).slice(0, 40)}" instead of JSON — add a "Webhook response" module that returns {"post_id": ...} so smart timing and learning get the post id.`);
  }
  if (data.error) throw new Error(`Make.com scenario reported an error: ${data.error}`);
  const out = { kind };
  if (data.post_id) out.post_id = String(data.post_id);
  if (data.id) out.id = String(data.id);
  return out;
}
