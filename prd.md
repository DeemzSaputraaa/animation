# Product Requirements Document (PRD)

## AI 3D Avatar Presenter Berbasis Script

### 1. Ringkasan Produk

Produk ini adalah aplikasi web yang memungkinkan pengguna memasukkan teks/script, kemudian karakter 3D akan membacakan script tersebut dengan:

- suara hasil Text-to-Speech,
- lip-sync sesuai ucapan,
- ekspresi wajah,
- gerakan kepala,
- gesture tangan dan badan,
- transisi animasi yang smooth,
- gerakan idle yang natural.

Karakter menggunakan asset 3D yang berasal dari Mixamo dalam format `.fbx`, kemudian diproses menjadi `.glb/.gltf` agar lebih optimal digunakan pada web.

Sistem tidak menggunakan Python sebagai renderer animasi.

Python digunakan sebagai backend intelligence layer untuk:

- TTS processing,
- script analysis,
- emotion analysis,
- gesture planning,
- lip-sync / viseme generation,
- timeline generation.

Rendering karakter dilakukan di browser menggunakan Three.js.

---

# 2. Tujuan Produk

Membangun sistem avatar presenter 3D yang dapat menerima script dan secara otomatis menghasilkan performa karakter yang terasa natural.

Contoh input:

> Selamat datang di Kampung Kecil. Pada video ini kita akan membahas bagaimana kecerdasan buatan bekerja.

Output:

- karakter mulai dari idle,
- melihat ke arah kamera,
- mulai berbicara,
- mulut mengikuti ucapan,
- kepala bergerak secara subtle,
- tangan bergerak ketika menjelaskan,
- ekspresi wajah berubah sesuai konteks,
- kembali ke idle setelah selesai berbicara.

---

# 3. Target Utama

Versi pertama produk harus mampu melakukan pipeline:

```text
Script
    ↓
Backend
    ↓
Text-to-Speech
    ↓
Audio + Timing
    ↓
Lip Sync
    ↓
Emotion Analysis
    ↓
Gesture Planning
    ↓
Performance Timeline
    ↓
Frontend
    ↓
Three.js Animation Engine
    ↓
3D Character Performance
```

Target kualitas utama:

- animasi tidak terasa patah,
- tidak menggunakan gesture yang sama terus-menerus,
- mulut cukup sinkron dengan audio,
- karakter tidak terlihat diam seperti patung,
- gesture mengikuti makna pembicaraan,
- animasi badan dan wajah dapat dimainkan secara bersamaan.

---

# 4. Target Platform

Platform utama:

**Web Application**

Desktop menjadi prioritas utama pada MVP.

Browser target:

- Google Chrome
- Microsoft Edge
- Firefox
- Safari modern

Mobile support dapat dikembangkan setelah desktop stabil.

---

# 5. Tech Stack

## Frontend

Framework:

```text
Next.js
React
TypeScript
```

3D Engine:

```text
Three.js
React Three Fiber
@react-three/drei
```

State management:

```text
Zustand
```

Optional:

```text
Framer Motion
```

untuk UI, bukan animation karakter.

---

## Backend

```text
Python
FastAPI
Pydantic
```

Backend menangani:

```text
Script Processing
TTS
Emotion Analysis
Gesture Planning
Viseme Generation
Timeline Generation
```

---

## Character Processing

Software:

```text
Blender
Mixamo
```

Format source:

```text
FBX
```

Format runtime:

```text
GLB / glTF
```

GLB menjadi format utama untuk website.

---

# 6. High-Level Architecture

```text
                         USER

                          │
                          ▼

                     WEB APP
                 Next.js / React

                          │
                          │ Script
                          ▼

                  PYTHON BACKEND
                       FastAPI

                          │
          ┌───────────────┼───────────────┐

          ▼               ▼               ▼

      TTS Engine     Script Analyzer   Emotion Analyzer

          │               │               │
          │               └───────┬───────┘
          │                       │
          ▼                       ▼

        Audio              Gesture Planner

          │                       │
          ▼                       │

   Phoneme / Timing               │

          │                       │
          ▼                       ▼

        Viseme              Gesture Timeline

          │                       │
          └───────────┬───────────┘
                      │

                      ▼

             Performance Timeline

                      │
                      ▼

              THREE.JS ENGINE

                      │

       ┌──────────────┼───────────────┐

       ▼              ▼               ▼

      Body           Face            Mouth

    Animation      Expression       Viseme

       │              │               │

       └──────────────┼───────────────┘
                      │
                      ▼

                 3D CHARACTER
```

---

# 7. User Flow

## Flow 1 — Input Script

User membuka aplikasi.

User melihat:

```text
3D Character Preview
Script Editor
Generate Performance Button
Play Button
Stop Button
```

User memasukkan script.

Contoh:

```text
Selamat datang.

Hari ini kita akan membahas bagaimana kecerdasan buatan dapat membantu kehidupan manusia.
```

User menekan:

```text
Generate
```

Frontend mengirim request:

```text
POST /api/performance
```

---

# 8. Backend Processing

Backend menerima:

```json
{
  "text": "Selamat datang...",
  "language": "id-ID",
  "voice": "default"
}
```

Backend kemudian menjalankan beberapa proses.

---

# 9. Text-to-Speech

Input:

```text
script
```

Output:

```text
audio file
word timing
phoneme timing
```

Contoh:

```json
{
  "audio_url": "/generated/audio/session-001.mp3",
  "duration": 8.4
}
```

Audio harus menjadi master clock untuk seluruh animasi.

Artinya seluruh animation timeline mengikuti:

```text
audio.currentTime
```

dan bukan timer yang berdiri sendiri.

---

# 10. Lip Sync System

Lip-sync tidak hanya mengikuti volume suara.

Sistem harus menggunakan:

```text
phoneme
        ↓
viseme
        ↓
facial morph target
```

Contoh:

```text
M / B / P
    ↓
viseme_MBP

A
    ↓
viseme_A

O
    ↓
viseme_O

F / V
    ↓
viseme_FV
```

Minimum supported viseme:

```text
rest

A
E
I
O
U

MBP
FV
L
WQ
TH
CH
```

---

# 11. Facial Morph Target Requirements

Character minimal memiliki:

```text
viseme_A
viseme_E
viseme_I
viseme_O
viseme_U

viseme_MBP
viseme_FV
viseme_L
viseme_WQ
viseme_TH

blinkLeft
blinkRight

smile
frown

browUp
browDown
```

Idealnya ditambahkan:

```text
jawOpen
mouthSmileLeft
mouthSmileRight
mouthFrownLeft
mouthFrownRight
cheekRaise
eyeSquintLeft
eyeSquintRight
```

---

# 12. Character Requirement

Asset karakter harus memiliki:

```text
body mesh
skeleton
skin weight
animation rig
facial mesh
```

Jika karakter hanya berasal dari Mixamo, kemungkinan besar tersedia:

```text
body skeleton
body skinning
```

tetapi belum tentu tersedia:

```text
facial rig
facial blendshape
viseme
```

Maka tahap preprocessing karakter diperlukan.

---

# 13. Character Preprocessing Pipeline

Pipeline:

```text
Mixamo FBX
    ↓
Blender
    ↓
Clean Character
    ↓
Add / Verify Facial Morph Targets
    ↓
Import Animation Clips
    ↓
Export
    ↓
character.glb
```

Runtime tidak menggunakan `.fbx` sebagai format utama.

Format target:

```text
GLB
```

---

# 14. Animation Library

Jangan membuat satu animasi panjang untuk setiap script.

Sistem menggunakan modular animation clips.

## Idle

```text
idle_neutral
idle_breathing
idle_shift_weight
idle_relaxed
```

## Gesture

```text
gesture_open_hand

gesture_explain_left

gesture_explain_right

gesture_both_hands

gesture_emphasis

gesture_point

gesture_count

gesture_question
```

## Head

```text
head_nod

head_shake

head_tilt_left

head_tilt_right
```

## Emotional Gesture

```text
happy

serious

thinking

confused

excited

welcoming
```

---

# 15. Animation Layer System

Animation harus dibagi menjadi beberapa layer.

```text
Layer 1
Base / Idle

Layer 2
Upper Body Gesture

Layer 3
Head Motion

Layer 4
Face Expression

Layer 5
Lip Sync

Layer 6
Eyes

Layer 7
Micro Movement
```

Contoh:

```text
Idle Breathing
+
Right Hand Explanation
+
Head Nod
+
Smile 0.2
+
Viseme A
+
Blink
```

dapat berjalan bersamaan.

---

# 16. Animation Blending

Semua animation clip tidak boleh berpindah secara langsung.

Contoh yang tidak diinginkan:

```text
idle

CUT

gesture
```

Yang dibutuhkan:

```text
idle

crossfade

gesture

crossfade

idle
```

Target transition:

```text
0.2 – 0.5 detik
```

tergantung jenis animasi.

---

# 17. Script Analyzer

Script Analyzer bertugas memahami struktur kalimat.

Contoh input:

```text
Nah, sekarang kita sampai pada bagian yang sangat penting.
```

Output:

```json
{
  "sentences": [
    {
      "text": "Nah, sekarang kita sampai pada bagian yang sangat penting.",
      "emotion": "serious",
      "energy": 0.65,
      "emphasis": ["sangat penting"]
    }
  ]
}
```

---

# 18. Emotion System

Emotion minimum:

```text
neutral
friendly
happy
serious
thinking
excited
concerned
```

Emotion memengaruhi:

```text
facial expression

head movement

gesture frequency

gesture intensity

body posture
```

Contoh:

```text
serious

→ gesture lebih sedikit
→ body movement lebih lambat
→ eyebrow sedikit turun
→ head movement lebih kecil
```

Sedangkan:

```text
excited

→ gesture lebih besar
→ movement lebih cepat
→ eyebrow naik
→ smile meningkat
```

---

# 19. Gesture Planner

Gesture Planner tidak menggerakkan bone secara langsung.

Gesture Planner hanya memilih animation primitives.

Input:

```text
sentence
emotion
emphasis
duration
```

Output:

```json
[
  {
    "time": 1.4,
    "animation": "gesture_explain_right",
    "weight": 0.7
  },
  {
    "time": 3.6,
    "animation": "head_nod",
    "weight": 0.4
  }
]
```

---

# 20. Gesture Rules

Sistem harus mencegah gerakan berlebihan.

Aturan awal:

```text
maximum major gesture:
1 setiap 2–4 detik

minimum gesture spacing:
1.5 detik

gesture tidak boleh selalu bergantian kiri-kanan

gesture tidak boleh dimainkan pada setiap kata
```

Gunakan randomization kecil.

Contoh:

```text
gesture_explain_right

weight:
0.55 – 0.75

playback speed:
0.9 – 1.1
```

Tujuannya agar karakter tidak terlihat mekanis.

---

# 21. Micro Animation

Agar karakter terlihat hidup, tambahkan procedural animation.

Minimal:

```text
breathing

eye blinking

micro head movement

subtle body sway

eye target

small shoulder movement
```

Blink interval dapat bervariasi.

Contoh:

```text
2.5 – 6 detik
```

dan tidak menggunakan interval tetap.

---

# 22. Eye System

Default:

```text
karakter melihat kamera
```

Tetapi mata tidak boleh benar-benar statis.

Gunakan micro movement.

Contoh:

```text
camera

slightly left

camera

slightly right

camera
```

Semua pergerakan harus sangat kecil.

---

# 23. Performance Timeline

Backend menghasilkan satu file performance.

Contoh:

```json
{
  "version": 1,

  "duration": 8.4,

  "audio": "/audio/session001.mp3",

  "emotion": [
    {
      "start": 0,
      "end": 2.5,
      "emotion": "friendly"
    },
    {
      "start": 2.5,
      "end": 8.4,
      "emotion": "explaining"
    }
  ],

  "gestures": [
    {
      "start": 0.8,
      "animation": "gesture_open_hand",
      "weight": 0.6
    },

    {
      "start": 3.1,
      "animation": "gesture_explain_right",
      "weight": 0.7
    }
  ],

  "head": [
    {
      "start": 4.2,
      "animation": "head_nod",
      "weight": 0.35
    }
  ],

  "visemes": [
    {
      "time": 0.14,
      "viseme": "A",
      "weight": 0.82
    },

    {
      "time": 0.22,
      "viseme": "MBP",
      "weight": 0.9
    }
  ]
}
```

---

# 24. Frontend Animation Engine

Frontend memiliki:

```text
AnimationController

GestureController

FaceController

LipSyncController

LookController

IdleController
```

---

# 25. AnimationController

Bertanggung jawab untuk:

```text
load clips

play animation

stop animation

crossfade

animation weight

animation playback speed
```

---

# 26. LipSyncController

Bertanggung jawab membaca:

```text
audio.currentTime
```

kemudian mencari viseme aktif.

Contoh:

```text
audio time:

2.43 sec

timeline:

2.40 → viseme A
2.48 → viseme O
```

Maka controller melakukan interpolation:

```text
A → O
```

bukan perpindahan instan.

---

# 27. FaceController

Mengontrol:

```text
emotion

smile

eyebrow

eye squint

blink
```

Expression dan lip-sync harus dapat berjalan bersamaan.

Contoh:

```text
smile = 0.25

viseme_A = 0.75
```

---

# 28. GestureController

GestureController membaca timeline seperti:

```json
{
  "time": 3.2,
  "animation": "gesture_explain_right"
}
```

Kemudian:

```text
load AnimationAction

fadeIn

play

fadeOut

return to idle
```

---

# 29. IdleController

Ketika tidak ada gesture:

```text
idle animation tetap berjalan
```

Pilihan idle dapat berubah secara random.

Contoh:

```text
idle_neutral

↓

idle_shift_weight

↓

idle_neutral

↓

idle_breathing
```

---

# 30. API Requirements

## Generate Performance

Endpoint:

```text
POST /api/performance
```

Request:

```json
{
  "text": "Selamat datang...",
  "language": "id-ID",
  "voice": "default"
}
```

Response:

```json
{
  "id": "performance_001",
  "audio_url": "/generated/performance_001.mp3",
  "timeline_url": "/generated/performance_001.json"
}
```

---

# 31. Frontend Interface MVP

Layout:

```text
+------------------------------------------------+

              3D CHARACTER VIEW

                  Character

+------------------------------------------------+

Script

[                                             ]
[                                             ]
[                                             ]

Voice:
[ Indonesian ▼ ]

[ Generate Performance ]

[ Play ] [ Pause ] [ Stop ]

+------------------------------------------------+
```

---

# 32. MVP Scope

Version 1 harus memiliki:

```text
3D character loading

idle animation

body animation

animation blending

script input

text-to-speech

audio playback

basic lip-sync

basic facial expression

AI gesture selection

head movement

random blinking

performance timeline
```

---

# 33. Tidak Termasuk MVP

Jangan masukkan terlebih dahulu:

```text
real-time microphone conversation

speech recognition

multiplayer

full-body motion capture

camera-based body tracking

voice cloning

real-time streaming avatar

advanced finger animation

procedural walking

mobile optimization
```

Fitur tersebut baru masuk fase selanjutnya.

---

# 34. Folder Structure

```text
ai-avatar/
│
├── frontend/
│
│   ├── app/
│   │
│   ├── components/
│   │   ├── Avatar.tsx
│   │   ├── AvatarScene.tsx
│   │   ├── ScriptEditor.tsx
│   │   └── PlayerControls.tsx
│   │
│   ├── animation/
│   │   ├── AnimationController.ts
│   │   ├── GestureController.ts
│   │   ├── LipSyncController.ts
│   │   ├── FaceController.ts
│   │   ├── IdleController.ts
│   │   └── LookController.ts
│   │
│   ├── stores/
│   │   └── avatarStore.ts
│   │
│   └── public/
│       │
│       ├── models/
│       │   └── character.glb
│       │
│       ├── animations/
│       │   ├── idle.glb
│       │   ├── talking.glb
│       │   ├── explain-left.glb
│       │   ├── explain-right.glb
│       │   └── nod.glb
│       │
│       └── audio/
│
└── backend/
    │
    ├── app/
    │   ├── main.py
    │   ├── config.py
    │   │
    │   ├── api/
    │   │   └── performance.py
    │   │
    │   ├── services/
    │   │   ├── tts.py
    │   │   ├── phoneme.py
    │   │   ├── viseme.py
    │   │   ├── emotion.py
    │   │   ├── gesture.py
    │   │   └── timeline.py
    │   │
    │   └── models/
    │       └── performance.py
    │
    └── generated/
```

---

# 35. Development Phase

## Phase 1 — Character Runtime

Goal:

Menampilkan karakter dengan benar.

Deliverable:

```text
FBX → GLB

character tampil di browser

camera setup

lighting setup

skeleton berjalan
```

Success criteria:

Karakter dapat dirender stabil minimal pada 60 FPS di desktop modern.

---

# 36. Phase 2 — Animation System

Implementasikan:

```text
AnimationMixer

idle

gesture

crossfade

animation weight
```

Success criteria:

Transisi antar-animation tidak memiliki gerakan patah yang terlihat jelas.

---

# 37. Phase 3 — Facial Rig

Tambahkan:

```text
morph target

blink

smile

basic viseme
```

Success criteria:

Developer dapat mengubah ekspresi karakter melalui parameter.

Contoh:

```text
smile = 0.5

blinkLeft = 1

viseme_A = 0.8
```

---

# 38. Phase 4 — TTS

Implementasikan:

```text
script → voice
```

Audio dapat diputar dari browser.

Success criteria:

Script Bahasa Indonesia dapat menjadi audio dengan timing yang konsisten.

---

# 39. Phase 5 — Lip Sync

Implementasikan:

```text
audio

↓

phoneme

↓

viseme

↓

morph targets
```

Success criteria:

Mulut terlihat mengikuti ucapan secara visual dan tidak sekadar buka-tutup berdasarkan volume.

---

# 40. Phase 6 — Script Understanding

Implementasikan:

```text
emotion analyzer

sentence segmentation

emphasis detection
```

Success criteria:

Kalimat dapat diklasifikasikan menjadi:

```text
neutral

friendly

serious

thinking

excited
```

---

# 41. Phase 7 — Gesture AI

Implementasikan:

```text
sentence

↓

gesture planner

↓

animation timeline
```

Success criteria:

Gesture:

- tidak dimainkan terlalu sering,
- relevan dengan kalimat,
- tidak terlalu repetitif,
- memiliki variasi timing.

---

# 42. Phase 8 — Natural Motion

Tambahkan:

```text
blink

breathing

head micro movement

eye movement

idle variations

gesture randomization
```

Success criteria:

Karakter tetap terlihat hidup ketika tidak sedang memainkan major gesture.

---

# 43. Performance Requirements

Target:

```text
Desktop:

50–60 FPS
```

Ukuran karakter:

```text
ideal:
< 15 MB

maximum MVP:
30 MB
```

Animation clips sebisa mungkin:

```text
< 1 MB per clip
```

Gunakan:

```text
Draco compression

texture compression
```

jika diperlukan.

---

# 44. UX Requirements

User tidak boleh menunggu halaman tanpa feedback.

Saat generate:

```text
Generating voice...

Analyzing script...

Generating animation...

Ready
```

Player state:

```text
idle

generating

ready

playing

paused

finished

error
```

---

# 45. Error Handling

Sistem harus menangani:

```text
TTS gagal

AI analysis gagal

audio gagal dimuat

GLB gagal dimuat

animation clip tidak ditemukan

morph target tidak tersedia
```

Jika gesture generation gagal:

fallback:

```text
idle talking
+
basic random gesture
```

Jika emotion generation gagal:

fallback:

```text
neutral
```

---

# 46. Acceptance Criteria MVP

Produk dianggap MVP selesai jika:

1. User dapat memasukkan script.

2. Sistem menghasilkan audio.

3. Karakter memainkan audio tersebut.

4. Bibir bergerak mengikuti ucapan.

5. Karakter memiliki idle animation.

6. Karakter dapat memainkan minimal lima gesture.

7. Gesture tidak menghentikan seluruh idle/body animation secara kasar.

8. Animasi menggunakan crossfade.

9. Karakter melakukan random blinking.

10. Karakter melakukan subtle head movement.

11. Gesture dipilih berdasarkan isi script.

12. Ekspresi wajah dapat berubah berdasarkan emosi.

13. Semua animation event tersinkronisasi terhadap audio.

---

# 47. Risiko Teknis

## Risiko 1 — Character Tidak Memiliki Facial Rig

Ini merupakan risiko terbesar.

Jika model Mixamo hanya memiliki skeleton tubuh, sistem tidak dapat membuat lip-sync berkualitas.

Solusi:

```text
tambahkan facial blendshape di Blender
```

atau gunakan karakter lain yang sudah memiliki ARKit-compatible blendshapes.

---

## Risiko 2 — Animasi Terlihat Robotik

Penyebab:

```text
gesture terlalu sering

animation transition kasar

gesture selalu sama

head terlalu diam

eye terlalu diam
```

Solusi:

```text
animation blending

gesture cooldown

randomization

micro-animation
```

---

## Risiko 3 — Lip Sync Terlihat Salah

Penyebab:

```text
hanya menggunakan audio amplitude
```

Solusi:

gunakan:

```text
phoneme → viseme
```

---

## Risiko 4 — Overengineering Terlalu Cepat

Kesalahan yang harus dihindari:

langsung membuat:

```text
AI

WebSocket

real-time voice

motion capture

complex IK

procedural full body
```

sementara karakter bahkan belum memiliki facial morph yang benar.

Prioritas pengembangan harus tetap:

```text
character

↓

animation

↓

face

↓

voice

↓

lip-sync

↓

AI gesture
```

---

# 48. Future Development

Setelah MVP stabil dapat ditambahkan:

```text
Real-time microphone conversation

Speech-to-text

LLM conversation

Streaming TTS

WebSocket

Interactive AI avatar

Emotion-aware response

Camera awareness

Real-time eye tracking

Procedural hand IK

Automatic pointing

Real-time facial animation

Multiple characters

Virtual classroom

Presentation mode

PPT integration
```

---

# 49. Future Real-Time Architecture

Fase berikutnya:

```text
Microphone
     ↓
Speech Recognition
     ↓
LLM
     ↓
Response
     ↓
Streaming TTS
     ↓
Audio Chunks
     ↓
Visemes
     ↓
WebSocket
     ↓
Three.js Avatar
```

WebSocket baru dibutuhkan ketika komunikasi sudah bersifat streaming/realtime.

---

# 50. Product Priority

Urutan prioritas development:

```text
P0

Character dapat tampil
Skeleton benar
AnimationMixer berjalan
Idle animation


P1

Animation blending
Gesture library
GLB pipeline


P2

Facial morph targets
Blink
Expression


P3

Text-to-Speech
Audio synchronization


P4

Phoneme / viseme
Lip-sync


P5

Emotion detection
Gesture planner


P6

Micro movement
Eye movement
Natural idle


P7

Real-time conversation
WebSocket
Streaming AI
```

---

# 51. Definition of Done

Produk versi pertama dianggap berhasil apabila user dapat menulis:

```text
"Selamat datang. Hari ini kita akan mempelajari dasar-dasar kecerdasan buatan."
```

kemudian menekan:

```text
Generate
```

dan sistem secara otomatis menghasilkan performa karakter berupa:

```text
voice
+
lip-sync
+
blink
+
facial expression
+
head movement
+
body gesture
+
idle movement
```

yang berjalan sinkron sebagai satu performance.

---

# 52. Prinsip Utama Implementasi

Tiga prinsip yang tidak boleh dilanggar:

### 1. Audio adalah master timeline.

Semua animasi mengikuti:

```text
audio.currentTime
```

bukan timer terpisah.

### 2. AI memilih animasi, bukan menggerakkan bone setiap frame.

AI menghasilkan:

```text
gesture timeline
```

Three.js yang menjalankan gerakannya.

### 3. Natural movement berasal dari layering.

Karakter natural bukan karena satu animasi yang sangat kompleks.

Karakter natural muncul dari kombinasi:

```text
idle

+

gesture

+

head movement

+

face

+

eyes

+

lip-sync

+

micro movement
```

yang semuanya dimainkan secara sinkron.
