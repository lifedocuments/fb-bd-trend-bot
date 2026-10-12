// Turns a post into a branded photocard image by running scripts/photocard.py.
// Returns the path of the PNG, or null if anything goes wrong — the caller
// then posts the plain photo instead, so a failed card never blocks a post.
import { spawn } from 'node:child_process';
import { writeFile, stat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'photocard.py');

export function banglaDate(date = new Date()) {
  return new Intl.DateTimeFormat('bn-BD', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka'
  }).format(date).replace(',', '');
}

function runPython(input, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const py = spawn(process.env.PHOTOCARD_PYTHON || 'python3', [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => { py.kill('SIGKILL'); }, timeoutMs);
    py.stderr.on('data', (d) => { err += d; });
    py.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, err: e.message }); });
    py.on('close', (code) => { clearTimeout(timer); resolve({ code, err: err.trim() }); });
    py.stdin.end(JSON.stringify(input));
  });
}

export async function makePhotocard({ imageUrl, headline, label, credit, pageName, tag, mood }) {
  try {
    const dir = await mkdtemp(path.join(tmpdir(), 'photocard-'));
    let photo = '';
    if (imageUrl) {
      try {
        const res = await fetch(imageUrl);
        if (res.ok) {
          photo = path.join(dir, 'photo.jpg');
          await writeFile(photo, Buffer.from(await res.arrayBuffer()));
        }
      } catch (e) {
        console.warn('[photocard] Could not download the photo, using the plain design:', e.message);
      }
    }
    const out = path.join(dir, 'card.png');
    const { code, err } = await runPython({
      out, headline, photo, label, credit, mood,
      page_name: pageName, tag, date_text: banglaDate()
    });
    if (code === 3) {
      console.warn('[photocard] Bangla text shaping is not available on this runner — posting the plain photo instead.');
      return null;
    }
    if (code !== 0) {
      console.warn(`[photocard] Card drawing failed (exit ${code}): ${err.slice(0, 300)} — posting the plain photo instead.`);
      return null;
    }
    await stat(out);
    return out;
  } catch (e) {
    console.warn('[photocard] Card step failed, posting the plain photo instead:', e.message);
    return null;
  }
}
