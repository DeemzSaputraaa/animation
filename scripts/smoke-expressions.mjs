import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
await mkdir('artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.preview-panel[data-ready="true"]', { timeout: 90000 });
  const panel = page.getByRole('region', { name: 'Ekspresi karakter' });
  const choose = async label => {
    const button = panel.getByRole('button', { name: label, exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
  };
  assert(await page.getByLabel('Kekuatan ekspresi').isDisabled());
  await page.getByRole('button', { name: 'Fokus wajah', exact: false }).click();
  for (const label of ['Netral', 'Senyum', 'Senang', 'Bahagia', 'Tertawa', 'Sedih', 'Marah', 'Terkejut', 'Berpikir', 'Serius']) {
    await choose(label);
    await page.getByLabel('Kekuatan ekspresi').fill('100');
    await page.waitForTimeout(200);
    await page.locator('.preview-panel').screenshot({ path: `artifacts/expression-${label.toLowerCase()}.png` });
  }
  await choose('Senyum');
  await page.getByLabel('Kekuatan ekspresi').fill('35');
  assert.equal(await panel.locator('output').textContent(), '35%');
  await page.getByLabel('Pilih karakter').selectOption('ardi');
  await page.waitForSelector('.preview-panel[data-ready="true"]');
  assert.equal(await panel.getByRole('button', { name: 'Senyum', exact: true }).getAttribute('aria-pressed'), 'true');
  await choose('Tertawa');
  await page.getByLabel('Pilih karakter').selectOption('harry');
  await page.waitForSelector('.preview-panel[data-ready="true"]');
  await page.locator('#script').fill('Saya senang bisa menjelaskan materi ini. Mari kita pelajari bersama dengan tenang.');
  await page.getByRole('button', { name: 'Generate Performance' }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled || !!document.querySelector('.error-box'), null, { timeout: 180000 });
  assert.equal(await page.locator('.error-box').count(), 0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('.seek input').value) > .3);
  const time = Number(await page.locator('.seek input').inputValue());
  await choose('Marah');
  await page.waitForFunction(previous => Number(document.querySelector('.seek input').value) > previous + .2, time);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.locator('.seek input').inputValue();
  await choose('Bahagia');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.seek input').inputValue(), paused);
  await choose('Otomatis');
  assert(await page.getByLabel('Kekuatan ekspresi').isDisabled());
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: 'artifacts/expression-controls-mobile.png' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  console.log('All manual expressions, intensity, character switching, automatic mode, uninterrupted audio, pause, and mobile layout passed.');
} finally { await browser.close(); }
