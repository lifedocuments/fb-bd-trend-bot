// Telegram control bot helpers. Everything is optional: with no
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secrets these do nothing, and they
// never throw, so Telegram problems can't break posting.
const API = 'https://api.telegram.org';

export function telegramOn() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function notify(text) {
  if (!telegramOn()) return false;
  try {
    const res = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: String(text).slice(0, 4000), disable_web_page_preview: true })
    });
    if (!res.ok) console.warn(`[telegram] sendMessage returned HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn('[telegram] Could not send message:', e.message);
    return false;
  }
}

export async function getUpdates(offset) {
  const res = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?timeout=0&offset=${offset}&allowed_updates=${encodeURIComponent('["message"]')}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`getUpdates failed: ${data.description || 'HTTP ' + res.status}`);
  return data.result || [];
}

export function postLink({ format, postId, videoId, pageId }) {
  if (format === 'reel' && videoId) return `https://www.facebook.com/reel/${videoId}`;
  if (postId) return `https://www.facebook.com/${postId}`;
  return pageId ? `https://www.facebook.com/${pageId}` : '';
}
