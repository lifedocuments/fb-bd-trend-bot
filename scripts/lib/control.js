// Small shared state controlled from Telegram (data/control.json):
// paused on/off, and the last Telegram update already handled.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONTROL_PATH = path.join(HERE, '..', '..', 'data', 'control.json');

export async function loadControl() {
  try { return { paused: false, lastUpdateId: 0, ...JSON.parse(await readFile(CONTROL_PATH, 'utf8')) }; }
  catch { return { paused: false, lastUpdateId: 0 }; }
}
export async function saveControl(c) {
  await writeFile(CONTROL_PATH, JSON.stringify(c, null, 2) + '\n');
}
export async function isPaused() {
  return (await loadControl()).paused === true;
}
