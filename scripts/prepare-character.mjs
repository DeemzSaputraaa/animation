import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve('frontend/public/models/character.glb');
await mkdir(path.dirname(output), { recursive: true });
const server = await createServer({ configFile: false, publicDir: path.resolve('legacy/public'), server: { host: '127.0.0.1', port: 5198, strictPort: true }, plugins: [{
  name: 'character-bake-output', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/__prepare') { res.setHeader('Content-Type', 'text/html'); res.end('<html><body>Preparing character</body></html>'); return; }
      if (req.url !== '/__save-character' || req.method !== 'POST') return next();
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 100_000_000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      await writeFile(output, Buffer.concat(chunks)); res.end('ok');
    });
  },
}] });
await server.listen();
const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(error.message));
  await page.goto('http://127.0.0.1:5198/__prepare');
  const report = await page.evaluate(async () => (await import('/scripts/character-bake.js')).bake());
  if (report.bytes > 30_000_000) throw new Error(`GLB exceeds PRD size limit: ${report.bytes}`);
  await writeFile('frontend/public/models/character.manifest.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }
