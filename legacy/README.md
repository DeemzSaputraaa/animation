# Arsip prototipe sebelum migrasi PRD

Kode Vite/FBX lama dipertahankan sebagai referensi dan sumber bake karakter. Runtime aplikasi baru berada di `frontend/` dan `backend/`.

`scripts/character-bake.js` menggunakan modul rig lama **hanya saat preprocessing** untuk menghasilkan klip GLB. Frontend baru tidak mengimpor modul ini, tidak memuat FBX, dan tidak menjalankan walking/hand IK prosedural.

FBX sumber tersimpan di `public/models/hip-hop-dancing.fbx` relatif terhadap folder ini. Jangan menghapusnya bila ingin membangun ulang karakter.
