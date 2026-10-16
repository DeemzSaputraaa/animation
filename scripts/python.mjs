import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const python = fileURLToPath(new URL(process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python', import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const child = spawn(python, process.argv.slice(2), { stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
