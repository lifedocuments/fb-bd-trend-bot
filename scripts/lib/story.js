// Makes a 9:16 Story image (same look as the Reel's final frame) using
// scripts/photocard.py. Returns the PNG path or null on any failure.
import { spawn } from 'node:child_process';
import { writeFile, stat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { banglaDate } from './photocard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'photocard.py');

function runPython(input) {
  return new Promise((resolve) => {
    const py = spawn(process.env.PHOTOCARD_PYTHON || 'python3', [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => py.kill('SIGKILL'), 60000);
    py.stderr.on('data', (d) => { err += d; });
    py.stdout.on('data', () => {});
    py.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, err: e.message }); });
    py.on('close', (code) => { clearTimeout(timer); resolve({ code, err: err.trim() }); });
    py.stdin.end(JSON.stringify(input));
  });
}

export async function makeStoryImage({ imageUrl, headline, label, credit, pageName, mood }) {
  try {
    const dir = await mkdtemp(path.join(tmpdir(), 'story-'));
    let photo = '';
    if (imageUrl) {
      try {
        const res = await fetch(imageUrl);
        if (res.ok) { photo = path.join(dir, 'photo.jpg'); await writeFile(photo, Buffer.from(await res.arrayBuffer())); }
      } catch { /* plain design */ }
    }
    const out = path.join(dir, 'story.png');
    const { code, err } = await runPython({
      format: 'story', out_bg: path.join(dir, 'bg.png'), out_overlay: path.join(dir, 'ov.png'), out_story: out,
      headline, photo, label, credit, mood, page_name: pageName, date_text: banglaDate(),
      cta: 'বিস্তারিত দেখুন আমাদের পেজে'
    });
    if (code !== 0) { console.warn(`[story] Could not draw the Story image (exit ${code}) ${err.slice(0, 200)}`); return null; }
    await stat(out);
    return out;
  } catch (e) {
    console.warn('[story] Story image failed:', e.message);
    return null;
  }
}
