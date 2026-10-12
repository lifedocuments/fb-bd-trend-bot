// Builds a short vertical Reel (MP4) from a post: slow zoom on the photo,
// headline + brand fading in, silent audio track (no music = no copyright
// issues). Uses scripts/photocard.py for the layers and ffmpeg to encode.
// Returns the MP4 path, or null on any failure (caller posts a photo instead).
import { spawn } from 'node:child_process';
import { writeFile, stat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { banglaDate } from './photocard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'photocard.py');
const SECONDS = Number(process.env.REEL_SECONDS || 8);

function run(cmd, args, { input, timeoutMs = 180000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stderr.on('data', (d) => { err += d; });
    p.stdout.on('data', () => {});
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, err: e.message }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, err: err.trim() }); });
    p.stdin.end(input || '');
  });
}

export async function makeReel({ imageUrl, headline, label, credit, pageName, mood }) {
  try {
    const dir = await mkdtemp(path.join(tmpdir(), 'reel-'));
    let photo = '';
    if (imageUrl) {
      try {
        const res = await fetch(imageUrl);
        if (res.ok) {
          photo = path.join(dir, 'photo.jpg');
          await writeFile(photo, Buffer.from(await res.arrayBuffer()));
        }
      } catch { /* plain design background */ }
    }
    const bg = path.join(dir, 'bg.png');
    const overlay = path.join(dir, 'overlay.png');
    const py = await run(process.env.PHOTOCARD_PYTHON || 'python3', [SCRIPT], {
      input: JSON.stringify({
        format: 'reel', out_bg: bg, out_overlay: overlay, headline, photo, label, credit, mood,
        page_name: pageName, date_text: banglaDate()
      }),
      timeoutMs: 60000
    });
    if (py.code !== 0) {
      console.warn(`[reel] Could not draw the Reel layers (exit ${py.code}) ${py.code === 3 ? '— Bangla text shaping unavailable' : py.err.slice(0, 200)}`);
      return null;
    }

    const out = path.join(dir, 'reel.mp4');
    const fps = 30;
    const frames = SECONDS * fps;
    const filter = [
      // slow zoom on the background (render at 2x then scale for smoothness)
      `[0:v]scale=2160:3840,zoompan=z='min(zoom+0.0005,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps}[bg]`,
      // headline/brand layer fades in after a short moment
      `[1:v]format=rgba,fade=t=in:st=0.5:d=0.9:alpha=1[ov]`,
      `[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]`
    ].join(';');
    const ff = await run(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', bg,
      '-loop', '1', '-t', String(SECONDS), '-i', overlay,
      '-f', 'lavfi', '-t', String(SECONDS), '-i', 'anullsrc=r=44100:cl=stereo',
      '-filter_complex', filter,
      '-map', '[v]', '-map', '2:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-profile:v', 'high', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '96k', '-t', String(SECONDS),
      '-movflags', '+faststart', out
    ]);
    if (ff.code !== 0) {
      console.warn(`[reel] ffmpeg failed (exit ${ff.code}): ${ff.err.slice(0, 300)}`);
      return null;
    }
    const st = await stat(out);
    console.log(`[reel] Built ${SECONDS}s Reel (${Math.round(st.size / 1024)} KB).`);
    return out;
  } catch (e) {
    console.warn('[reel] Reel step failed:', e.message);
    return null;
  }
}
