import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const python = fileURLToPath(new URL(process.platform === "win32" ? "../.venv/Scripts/python.exe" : "../.venv/bin/python", import.meta.url));
const script = fileURLToPath(new URL("./synthesize.py", import.meta.url));

export function synthesize(payload, signal) {
  if (!existsSync(python)) throw new Error("Layanan suara belum dipasang. Ikuti langkah di README.md lalu mulai ulang server.");
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], signal });
    const chunks = [];
    let size = 0;
    const timeout = setTimeout(() => child.kill(), 40000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4_000_000) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || size > 4_000_000) return reject(new Error("Suara Ardi belum berhasil dibuat. Periksa koneksi internet lalu coba lagi."));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("Respons layanan suara tidak valid.")); }
    });
    // User text is data, never a shell argument or executable command.
    child.stdin.end(JSON.stringify(payload));
  });
}

export function createTtsMiddleware(generate = synthesize) {
  let active = 0;
  return async (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/tts") return next();
    const send = (status, data) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    if (req.method !== "POST") return send(405, { error: "Gunakan POST." });
    // Only the local app may call the endpoint through a browser.
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: "Origin tidak diizinkan." }); }
      catch { return send(403, { error: "Origin tidak valid." }); }
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) return send(415, { error: "Kirim JSON." });
    if (active >= 4) return send(429, { error: "Layanan suara sibuk. Coba beberapa saat lagi." });
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.on("close", abort);
    active++;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) { send(413, { error: "Teks terlalu panjang." }); return; }
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return send(400, { error: "JSON tidak valid." }); }
      if (typeof data?.text !== "string" || !data.text.trim() || data.text.length > 220
        || !Number.isFinite(data.rate) || data.rate < 0.6 || data.rate > 1.3) {
        return send(400, { error: "Teks atau kecepatan tidak valid." });
      }
      const result = await generate({ text: data.text, rate: data.rate }, controller.signal);
      send(200, result);
    } catch (error) {
      if (!controller.signal.aborted) send(503, { error: error.message || "Layanan suara tidak tersedia." });
    } finally {
      active--;
      res.off("close", abort);
    }
  };
}
