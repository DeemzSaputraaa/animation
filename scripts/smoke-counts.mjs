import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
await mkdir('artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.preview-panel[data-ready="true"]', { timeout: 90000 });
  await page.locator('#script').fill('Satu, dua, tiga, empat, lima, enam, tujuh, delapan, sembilan, sepuluh. Sekali lagi: 1,2,3,4,5,6,7,8,9,10. Kemudian 200, 100, 1250.');
  await page.getByRole('button', { name: 'Generate Performance' }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled || !!document.querySelector('.error-box'), null, { timeout: 180000 });
  assert.equal(await page.locator('.error-box').count(), 0, await page.locator('.error-box').allTextContents());
  const url = await page.getByRole('link', { name: 'Unduh timeline' }).getAttribute('href');
  const timeline = await (await page.request.get(new URL(url, page.url()).href)).json();
  await writeFile('artifacts/counts-timeline.json', JSON.stringify(timeline, null, 2));
  const counts = timeline.gestures.filter(event => /^gesture_count_([1-9]|10)$/.test(event.animation));
  const sequence = Array.from({ length: 10 }, (_, i) => i + 1);
  assert.deepEqual(counts.map(event => event.animation), [...sequence, ...sequence].map(n => `gesture_count_${n}`));
  for (const event of counts) assert(timeline.words.some(word => Math.abs(word.time - event.start - event.fade_in) < .001), 'Count pose must reach full weight at the spoken word');
  const numericWords = timeline.words.filter(word => /^\d+$/.test(word.text));
  for (const token of ['100', '200', '1250']) assert(numericWords.some(word => word.text === token), `Missing real TTS numeric token ${token}`);
  for (const word of numericWords) {
    assert(timeline.visemes.some(event => event.viseme !== 'rest' && event.time >= word.time && event.end <= word.time + word.duration + .001), `Missing lip movement for numeric token ${word.text}`);
  }
  console.log(JSON.stringify({ duration: timeline.duration, counts: counts.map(event => event.animation) }));
  await page.getByRole('button', { name: 'Fokus wajah', exact: false }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  for (const event of counts.slice(0, 10).reverse()) {
    const position = String(Number((event.start + event.fade_in + .06).toFixed(2)));
    await page.locator('.seek input').fill(position);
    await page.waitForTimeout(500);
    assert(Math.abs(Number(await page.locator('.seek input').inputValue()) - Number(position)) < .01, 'Pause/seek must hold the count');
    await page.locator('.preview-panel').screenshot({ path: `artifacts/count-${event.animation.split('_').at(-1)}.png` });
  }
  for (const token of ['200', '100']) {
    const word = numericWords.find(word => word.text === token);
    const vowel = timeline.visemes.find(event => event.viseme === 'A' && event.time >= word.time && event.end <= word.time + word.duration + .001);
    assert(vowel, `Missing A vowel in ${token}`);
    await page.locator('.seek input').fill(String(Number(((vowel.time + vowel.end) / 2).toFixed(2))));
    await page.waitForTimeout(300);
    await page.locator('.preview-panel').screenshot({ path: `artifacts/number-lips-${token}.png` });
  }
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  assert.equal(Number(await page.locator('.seek input').inputValue()), 0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('.status-pill.finished', { timeout: Math.ceil(timeline.duration * 1000) + 15000 });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Numeric lip-sync (1–10, 100, 200, 1250), count gestures, pause, backward seek, Stop and replay passed.');
} finally { await browser.close(); }
