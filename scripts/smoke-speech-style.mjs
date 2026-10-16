import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
await mkdir('artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [], requests = [], durations = {};
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/performance')) requests.push(request.postDataJSON()); });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.preview-panel[data-ready="true"]', { timeout: 90000 });
  assert.equal(await page.getByLabel('Gaya bicara').inputValue(), 'conversational');
  await page.locator('#script').fill('Halo, teman-teman. Hari ini kita belajar menghitung bersama, ya. Bagaimana kalau kita mencoba menghitung sampai sepuluh bersama? Kita mulai: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10. Setelah itu, kita coba 100 dan 200.');
  for (const [style, rate] of [['normal', .95], ['relaxed', .85], ['conversational', .95]]) {
    await page.getByLabel('Gaya bicara').selectOption(style);
    assert.equal(Number(await page.locator('#rate').inputValue()), rate);
    assert(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Generate Performance' }).click();
    await page.waitForFunction(() => !document.querySelector('.play-button').disabled || !!document.querySelector('.error-box'), null, { timeout: 180000 });
    assert.equal(await page.locator('.error-box').count(), 0, await page.locator('.error-box').allTextContents());
    assert.equal(requests.at(-1).speech_style, style);
    assert.equal(requests.at(-1).rate, rate);
    const url = await page.getByRole('link', { name: 'Unduh timeline' }).getAttribute('href');
    const timeline = await (await page.request.get(new URL(url, page.url()).href)).json();
    durations[style] = timeline.duration;
    assert(timeline.visemes.some(event => event.viseme !== 'rest'));
    assert(timeline.words.every(word => word.time + word.duration <= timeline.duration));
    assert(timeline.words.every((word, i) => !i || word.time >= timeline.words[i - 1].time));
    const audioUrl = await page.getByRole('link', { name: 'Unduh audio' }).getAttribute('href');
    const audio = await page.request.get(new URL(audioUrl, page.url()).href);
    await writeFile(`artifacts/voice-${style}.mp3`, await audio.body());
    if (style === 'conversational') {
      await writeFile('artifacts/voice-conversational.json', JSON.stringify(timeline, null, 2));
      const browserDuration = await page.evaluate(async url => {
        const audio = new Audio(url);
        await new Promise((resolve, reject) => { audio.onloadedmetadata = resolve; audio.onerror = reject; });
        return audio.duration;
      }, audioUrl);
      assert(Math.abs(browserDuration - timeline.duration) < .1, 'Browser and timeline must agree on joined MP3 duration');
    }
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('.seek input').value) > .5);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await page.locator('.seek input').inputValue();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.seek input').inputValue(), paused);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  }
  assert(durations.relaxed > durations.normal, 'The relaxed preset should actually produce slower speech');
  await page.screenshot({ path: 'artifacts/speech-style-conversational.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ durations, result: 'Normal/Santai/Ngobrol generation, timing, playback, pause and invalidation passed.' }));
} finally { await browser.close(); }
