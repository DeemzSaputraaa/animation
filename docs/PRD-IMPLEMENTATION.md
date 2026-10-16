# Pemetaan implementasi terhadap prd.md

Dokumen ini mencatat cakupan MVP, bukti, dan batas yang masih perlu divalidasi. Tidak mengubah isi PRD.

| Area PRD | Implementasi | Bukti / batas |
| --- | --- | --- |
| Stack dan arsitektur (§5–8, §34) | Next.js/React/TypeScript, R3F/drei, Zustand; FastAPI/Pydantic | `frontend/`, `backend/`; tidak ada rendering Python |
| Generate → Ready → Play/Pause/Stop (§7, §30–31, §44) | Job API 202, polling progress, cancel, audio preload, playback state, seek, replay | `avatarStore.ts`, `api/performance.py`, browser smoke test |
| GLB dan skeleton (§12–13, §35) | FBX dibake menjadi `character.glb`, tekstur embedded dan vertex digabung | 12,4 MB; skeleton dan morph diperiksa otomatis |
| Blender preprocessing (§13) | **Adaptasi tooling:** bake Three.js karena Blender tidak terpasang | GLB dapat diperiksa/diperbaiki di Blender; belum ada sculpt artistik di Blender |
| Library animasi (§14, §36) | 4 idle, 11 gesture termasuk hitungan jari 1/2/3, 4 head, 6 emotional clips | Manifest aset dan tes GLB; disimpan dalam satu GLB, bukan file per klip |
| Layering dan blending (§15–16, §24–29) | Mixer idle + upper body + head; controller terpisah untuk face/lip/eyes/micro movement | Envelope 0,3 detik, recovery idle 0,35 detik; tes pose deterministik |
| Facial rig (§10–11, §37) | A/E/I/O/U/MBP/FV/L/WQ/TH/CH, rest tanpa pengaruh morph; blinkLeft/Right, smile/frown, browUp/Down, jawOpen, arah mata | Semua nama wajib diperiksa; bentuk konsonan berbasis bibir, belum ada rig lidah khusus |
| TTS (§9, §38) | Ardi Indonesia, audio MP3 utuh dan word timing | edge-tts online; tanpa voice cloning atau fallback browser |
| Fonem dan lip-sync (§10, §26, §39) | Fonem ejaan Indonesia dipetakan ke viseme lalu diinterpolasi dalam durasi kata aktual | **Perkiraan**, belum forced alignment; metadata timing mencatat keterbatasan |
| Analisis naskah/emosi (§17–18, §40) | Segmentasi, emphasis, 7 emosi | Aturan semantik MVP, **bukan LLM/model terlatih**; fallback netral |
| Perencanaan gesture (§19–20, §41) | Pemilihan primitive berdasarkan kalimat, spacing 2,4–4 detik, variasi bobot/tempo, hindari repetisi langsung | Backend hanya merencanakan event; tidak menggerakkan bone |
| Hitungan jari (permintaan lanjutan) | Pose 1/2/3 mengikuti word boundary; tangan ditahan terangkat, jari crossfade hingga 120 ms sebelum angka berikutnya | Klip bake tanpa IK runtime; tes sendi jari, pause/seek, dan browser TTS; hitungan eksplisit mengesampingkan spacing gesture umum |
| Micro movement dan mata (§21–22, §42) | Breathing, sway ringan, gaze ke kamera, micro gaze, kedipan tidak berinterval tetap | Saat performa seluruhnya dihitung dari audio time; idle tanpa audio memakai clock lokal |
| Master clock (§23, §46, §52) | `HTMLAudioElement.currentTime` untuk semua layer performa | Pause membekukan pose; seek mengevaluasi ulang semua layer |
| Error handling (§45) | TTS/load audio/GLB/morph error; fallback klip dan analisis; cancel job | Unit test dan browser smoke test |
| Batas ukuran (§43) | GLB 12,4 MB, di bawah target ideal 15 MB | Compression tambahan belum diperlukan |
| Target 50–60 FPS (§35, §43) | DPR dibatasi 1,5, shadow map 1024, vertex diindeks, GLB runtime | **Belum tersertifikasi** pada GPU desktop target; headless bukan benchmark representatif |
| Fitur luar MVP (§33, §48–50) | Tidak diaktifkan | Tidak ada mikrofon, streaming/WebSocket, walking atau hand IK runtime |

Perintah verifikasi, cara menjalankan, dan batas akurasi tersedia di [README](../README.md).
