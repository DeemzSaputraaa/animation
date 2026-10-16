import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { python } from './python.mjs';

function portAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function isAvatarBackend(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    return response.ok && data.status === 'ok' && data.voice === 'id-ID-ArdiNeural' && data.timeline_version === 1;
  } catch { return false; }
}

async function main() {
  // Check both ports before starting anything. Repeated npm run dev must not
  // create a second backend or terminate a server owned by another terminal.
  if (!await portAvailable(3000)) {
    if (await isAvatarBackend(3000)) {
      console.log('\nRuang Cerita sudah berjalan. Buka http://127.0.0.1:3000');
      console.log('Tidak perlu menjalankan npm run dev lagi. Untuk restart, tekan Ctrl+C di terminal server yang aktif.\n');
      return;
    }
    throw new Error('Port 3000 sedang dipakai. Hentikan server di terminal yang memakai port tersebut (Ctrl+C), lalu jalankan npm run dev kembali.');
  }
  const startBackend = await portAvailable(8000);
  if (!startBackend && !await isAvatarBackend(8000)) {
    throw new Error('Port 8000 sedang dipakai layanan lain. Hentikan layanan tersebut dari terminalnya, lalu coba lagi.');
  }
  if (startBackend && !existsSync(python)) {
    throw new Error('Virtual environment belum tersedia. Ikuti langkah instalasi Python di README.md.');
  }
  const children = [];
  if (startBackend) children.push(spawn(python, ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000'], { stdio: 'inherit', windowsHide: true }));
  else console.log('Memakai backend Ruang Cerita yang sudah aktif di port 8000.');
  children.push(spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'frontend', '--hostname', '127.0.0.1', '--port', '3000', '--webpack'], { stdio: 'inherit', windowsHide: true }));
  let stopping = false;
  function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(child => child.kill()); process.exitCode = code; }
  for (const child of children) {
    child.on('error', error => { console.error(error.message); stop(1); });
    child.on('exit', code => stop(code ?? 0));
  }
  process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
}

main().catch(error => { console.error(`\n${error.message}\n`); process.exitCode = 1; });
