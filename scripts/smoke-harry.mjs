import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
await mkdir('artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const ready = () => page.waitForSelector('.preview-panel[data-ready="true"]', { timeout: 90000 });
  await ready();
  assert.equal(await page.getByLabel('Pilih karakter').inputValue(), 'harry');
  await page.screenshot({ path: 'artifacts/harry-ready.png', fullPage: true });
  await page.getByRole('button', { name: 'Fokus wajah', exact: false }).click();
  await page.screenshot({ path: 'artifacts/harry-face.png', fullPage: true });
  await page.getByLabel('Pilih karakter').selectOption('ardi'); await ready();
  await page.getByLabel('Pilih karakter').selectOption('harry'); await ready();
  assert.equal(await page.locator('.error-box').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Harry renders; face focus and Harry / Ardi / Harry switching passed with no browser errors.');
} finally { await browser.close(); }
