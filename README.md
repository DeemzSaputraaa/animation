# Ruang Cerita — AI 3D Avatar Presenter

Implementasi MVP berdasarkan [prd.md](prd.md): Next.js + React + TypeScript, React Three Fiber/Three.js, Zustand, dan backend Python FastAPI. Karakter GLB dibaca browser; Python menghasilkan audio dan performance timeline.

## Menjalankan

Memerlukan Node.js 20.9+ (diuji 22.13), Python 3.10+, dan internet untuk TTS Ardi.

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm run dev
```

Buka **http://127.0.0.1:3000**. Satu perintah menjalankan Next.js di port 3000 dan FastAPI di port 8000. Hentikan server Vite lama bila masih berjalan; aplikasi baru tidak memakai port 5173. Pada macOS/Linux gunakan `.venv/bin/python` saat instalasi Python.

Alur: tulis naskah → **Generate Performance** → tunggu hingga siap → **Play**. Pause membekukan audio dan seluruh pose performa; seek mengambil ulang pose dari waktu audio, Stop mengembalikan karakter ke idle. Perubahan teks atau tempo membatalkan hasil sebelumnya agar naskah dan audio tidak tertukar. Proses generate dapat dibatalkan.

Suara memakai **Ardi · Bahasa Indonesia** tanpa API key OpenAI. Pilihan **Gaya bicara** menyediakan **Ngobrol** (default, tempo dasar 0,95×), **Santai** (0,85×, pitch −4 Hz), dan **Normal** (0,95×, pitch asli). Memilih gaya mengatur ulang tempo ke presetnya; slider Tempo dapat disesuaikan setelahnya.

Ngobrol memberi variasi kecil tempo/nada pada kelompok kalimat, maksimal sepuluh kelompok per naskah. Timestamp kata digeser sesuai durasi audio kelompok sebelumnya agar gerak bibir mengikuti suara. Perubahan gaya membutuhkan **Generate ulang**. Suara masih sintetis; naskah dengan bahasa percakapan dan tanda baca yang sesuai membantu penyampaian terasa alami.

Panel **Ekspresi karakter** di bawah preview menyediakan Otomatis, Netral, Senyum, Senang, Bahagia, Tertawa, Sedih, Marah, Terkejut, Berpikir, dan Serius. Pilih ekspresi lalu atur kekuatan 0–100%; hasil langsung terlihat pada Harry maupun Ardi tanpa Generate ulang, termasuk saat Play atau Pause. Pilihan manual berlaku sampai diganti atau dikembalikan ke **Otomatis**, yang mengikuti emosi naskah. Tertawa memberi gerak rahang saat preview; selama pemutaran, gerak mulut tetap mengikuti audio. Kontrol ini mengatur wajah, tidak menambahkan suara tawa atau mengubah nada TTS. Pilihan manual merupakan pengaturan preview sesi dan tidak mengubah JSON timeline yang diunduh.

Jika `npm run dev` menampilkan **Ruang Cerita sudah berjalan**, langsung buka URL di atas. Perintah memeriksa port sebelum memulai layanan, sehingga tidak membuat server duplikat. Untuk restart, tekan Ctrl+C di terminal server yang aktif, lalu jalankan perintah lagi. Aktivasi `.venv` boleh dilakukan, tetapi `npm run dev` sudah memilih Python dari `.venv` secara otomatis.

Jika instalasi lama gagal membuat suara dengan HTTP 403, pasang ulang dependensi menggunakan `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`, lalu restart server. Proyek memakai `edge-tts==7.3.0`, yang memperbaiki penolakan koneksi pada versi 7.2.8. Backend mencatat detail kegagalan di terminal, sedangkan UI membedakan penolakan layanan, batas permintaan, timeout, koneksi gagal, dan kegagalan penyusunan timeline.

## Struktur

```text
frontend/app/             halaman Next.js dan tampilan studio
frontend/components/      avatar, scene, editor, player, timeline
frontend/animation/       controller idle, gesture, face, lip-sync, look, mixer
frontend/stores/          Zustand dan lifecycle audio/generation
frontend/public/models/   character.glb dan manifest aset
backend/app/api/          job API untuk generate/status/cancel
backend/app/services/     TTS, analisis naskah/emosi, fonem, viseme, gesture, timeline
backend/app/models/       validasi request dan response
backend/generated/        audio MP3 dan timeline JSON hasil generate
scripts/                  startup, preprocessing GLB, browser smoke test
tests/                    pengujian controller dan aset GLB
backend/tests/            pengujian pipeline dan API
legacy/                   sumber FBX dan arsip prototipe, tidak masuk runtime baru
```

## API dan timeline

`POST /api/performance` menerima `{ "text": "Selamat datang.", "language": "id-ID", "voice": "default", "rate": 0.95 }`. Respons HTTP 202 berisi `id`, `status`, `stage`, `audio_url`, `timeline_url`, dan `status_url`. Poll `GET /api/performance/{id}` hingga `ready`; `DELETE` pada URL yang sama membatalkan pekerjaan. `GET /api/health` memeriksa backend.

Audio dan timeline baru boleh dipakai setelah status `ready`. Job disimpan dalam memori satu proses dan hilang ketika server dimulai ulang; file audio/JSON yang sudah jadi tetap berada di `backend/generated/`. Maksimal dua job aktif. Deployment multiworker memerlukan penyimpanan job/queue bersama. Aplikasi ini ditujukan untuk penggunaan lokal MVP, belum menyediakan akun pengguna.

Timeline versi 1 memuat durasi, kata, kalimat, fonem, viseme, emosi, gesture, head motion, sumber analisis, serta peringatan fallback. Semua pose performa mengikuti **`HTMLAudioElement.currentTime`**, termasuk idle, kedipan, dan micro movement selama pemutaran. Idle ketika tidak ada audio memakai waktu lokal. Transisi klip memakai envelope 0,3 detik; kembali ke idle 0,35 detik. Jadwal kedipan bervariasi 2,8–5,4 detik. Gesture utama berjarak 2,4–4 detik dan menghindari pengulangan langsung.

Gerakan bibir menggabungkan bentuk berulang dan perubahan konsonan sangat pendek di antara vokal. Transisi vokal dibaurkan hingga 110 ms mengelilingi batas bunyi agar rahang tidak berkedut cepat. Penutupan M/B/P, jeda nyata, durasi audio, dan hasil pose saat pause/seek tetap dipertahankan. Penyederhanaan ini dilakukan di frontend dan berlaku juga untuk timeline yang sudah dibuat.

Token angka dari TTS juga diubah menjadi ejaan Bahasa Indonesia untuk perhitungan bibir: `10` → “sepuluh”, `100` → “seratus”, `200` → “dua ratus”, dan `1250` → “seribu dua ratus lima puluh”. Konversi mencakup bilangan hingga triliunan; kode berawalan nol dan deret sangat panjang memakai pembacaan per digit. Naskah, teks subtitle, hitungan tangan, dan timestamp TTS tetap memakai data asli. Fonem dibagi di dalam durasi token angka, sehingga timing di dalam bilangan majemuk tetap berupa perkiraan. **Generate ulang** untuk memperbaiki timeline lama yang belum mempunyai gerak bibir pada digit.

Gesture tangan menggunakan pembagian bobot per kelompok tulang: idle berkurang hanya pada lengan atau kepala yang sedang memainkan gesture. Gerakan kaki dan bagian tubuh lain tetap aktif, sehingga gesture terlihat jelas tanpa saling melemahkan dengan idle. Gunakan tampilan seluruh tubuh untuk melihat gerakan tangan.

Hitungan **1–10** mengenali digit, kata `satu` hingga `sepuluh`, serta urutan `pertama` hingga `kesepuluh` (termasuk `ke-1` hingga `ke-10`) pada timestamp kata TTS. Angka 1–4 membuka telunjuk, tengah, manis, lalu kelingking kanan; 5 membuka jempol. Angka 6–10 mempertahankan lima jari kanan dan menambahkan 1–5 jari kiri. Pose disesuaikan dengan tulang setiap model saat dimuat, termasuk jempol Harry yang dilipat di depan jari, bukan menembus telapak. Pada urutan rapat, jari bertransisi selama hingga 120 ms; saat melewati angka 5, tangan kiri mendapat antisipasi hingga 400 ms. Angka majemuk seperti “dua belas” tidak dianggap hitungan dua. **Klik Generate lagi** untuk mendapatkan timeline hitungan 1–10; restart backend jika proses lama masih aktif.

## Karakter dan preprocessing

Pilihan awal sekarang **Harry Potter (Ready Player Me)**. Dropdown di kiri bawah preview dapat digunakan untuk beralih ke **Ardi**. Suara tetap Ardi Bahasa Indonesia; pergantian karakter menghentikan pemutaran dan mempertahankan performa yang sudah siap agar bisa diputar ulang.

Harry memakai transisi gesture lebih panjang (masuk hingga 0,55 detik, keluar hingga 0,7 detik), percepatan/perlambatan gerak, dan perpindahan idle 1,2 detik. Gerak napas/torso, susulan bahu–siku–pergelangan, serta lengkungan jari saat istirahat mengurangi pose kaku. Gerakan tambahan mengikuti waktu audio sehingga pause/seek tetap konsisten; pose jari hitungan dan timing katanya dipertahankan. Perubahan ini langsung berlaku pada timeline yang sudah ada tanpa membake ulang GLB.

Sumber Harry berada di `legacy/public/models/ready-player-me-harry-potter/source/harry.glb`. Aset runtime `frontend/public/models/harry.glb` berukuran sekitar 9,5 MB, mempertahankan tekstur, 63 morph bawaan (termasuk pada gigi), dan menerima 25 klip presenter dari karakter lama. Untuk membuat ulang setelah sumber atau animasi berubah:

```powershell
npm run prepare:harry
```

Konversi ini memakai Node.js, memetakan nama tulang Mixamo, mempertahankan panjang tulang Harry, menyesuaikan pergerakan panggul dan posisi kaki ke lantai. Nama viseme dan ekspresi Ready Player Me dipetakan oleh controller wajah; L menggunakan `viseme_nn` dan W/Q mendekati `viseme_RR`. Transfer gerak antarproporsi tubuh masih dapat memerlukan penyempurnaan artistik, khususnya kontak tangan/jari. `node scripts/smoke-harry.mjs` memeriksa pemuatan dan pergantian kedua karakter ketika frontend berjalan.

GLB siap pakai disertakan, sekitar **12,4 MB**, dengan 25 klip (4 idle, 11 gesture termasuk 3 pose hitungan jari, 4 head, 6 emotional), 11 viseme, jawOpen, blink kiri/kanan, smile/frown, browUp/browDown, dan 4 morph arah mata. Semua klip ditanam dalam satu GLB untuk menjaga rig yang sama. Tekstur dibatasi 1024 px; vertex yang identik digabung. Draco tidak diperlukan untuk mencapai batas ukuran saat ini.

```powershell
npm run prepare:character
```

Memerlukan Chrome/Chromium lokal; atur `CHROME_PATH` jika lokasi tidak standar. Perintah memuat sumber FBX dari `legacy/public/`, membake morph/klip, lalu menyimpan GLB dan manifest. IK hanya dipakai saat bake, bukan runtime. Blender tidak tersedia pada lingkungan implementasi, sehingga pipeline otomatis Three.js digunakan sebagai pengganti konversi manual. Untuk perbaikan artistik, impor GLB ke Blender, pertahankan skeleton serta nama shape key/klip, lalu ekspor glTF Binary. Nama morph wajib diperiksa oleh `npm test`.

## Validasi

```powershell
npm run typecheck
npm test
npm run test:backend
npm run build
```

Saat server berjalan, `node scripts/smoke-browser.mjs` memeriksa GLB, Generate dengan TTS sungguhan, Play/Pause/seek/Stop/replay, dan menyimpan tangkapan layar ke `artifacts/`. Uji ini memakai layanan online; tes unit memakai TTS mock. Headless browser bukan bukti target 50–60 FPS pada GPU desktop: profiling interaktif pada perangkat target tetap diperlukan.

`node scripts/smoke-counts.mjs` memeriksa hitungan kata dan digit dengan TTS sungguhan serta menyimpan preview pose 1–10. Tes pose memeriksa jumlah jari yang lurus/terlipat, posisi jempol di luar jari yang terlipat, kedua tangan terangkat untuk 6–10, serta pemulihan pose ketika pause/seek.

Untuk build produksi lokal: jalankan backend dengan `.venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`, lalu `npm run build` dan `npm run preview`. `BACKEND_URL` dapat dikonfigurasi sebelum build. Next.js mem-proxy `/api/` dan `/generated/` ke FastAPI; aplikasi tidak cukup di-host sebagai file statis.

## Batas akurasi MVP

- TTS menggunakan `edge-tts` dan **id-ID-ArdiNeural**, layanan Read Aloud Microsoft melalui klien komunitas. Naskah dikirim hanya saat Generate; tidak ada browser-TTS fallback atau voice cloning.
- Timestamp kata berasal dari TTS. Timestamp fonem **diperkirakan dari ejaan Bahasa Indonesia di dalam durasi kata**, bukan hasil forced alignment. E pepet/taling, singkatan, angka, dan kata asing masih dapat meleset. `timing_source` menyatakan keterbatasan ini.
- Analisis emosi/gesture memakai aturan semantik yang dapat diuji, bukan LLM/model terlatih. `analysis_source` menyatakan `semantic-rules-v1`. Bila analisis gagal, sistem memakai emosi netral dan gesture dasar.
- Morph wajah dibuat dari landmark karakter Ch06; viseme konsonan merupakan pendekatan bentuk bibir, tanpa rig lidah/gigi khusus. Penyempurnaan produksi memerlukan sculpt/rig wajah di Blender dan phoneme alignment yang lebih akurat.
- Fitur di luar MVP (mikrofon, streaming, WebSocket, mocap, walking prosedural, dan IK tangan runtime) tidak diaktifkan.

Rujukan integrasi: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [React Three Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation), [FastAPI static files](https://fastapi.tiangolo.com/tutorial/static-files/).
