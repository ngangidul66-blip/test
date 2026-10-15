# Cerdas Cermat Online

Game kuis multiplayer berbasis web untuk **1 host + 3 peserta**, dibuat dengan Node.js, Express, dan Socket.IO. Server menangani room, pemilihan kotak, timer, jawaban, skor, voting, dan hasil.

## Perubahan pada versi ini

- Ronde utama mengambil **paket 10 soal baru berbasis Google Search** melalui Gemini API dengan grounding. Sistem tidak diam-diam mengganti paket gagal dengan soal lokal buatan; jika layanan tidak tersedia atau API key belum disetel, game menampilkan pesan jelas agar host dapat memperbaiki konfigurasi atau mencoba lagi.
- Pilihan tingkat kesulitan hanya empat: Mudah (10 poin), Sedang (20 poin), Sulit (30 poin), dan Sangat Sulit (40 poin). Tidak ada lagi tingkat Bonus Tantangan.
- Setelah host/peserta memilih kesulitan, jenjang pendidikan, dan mata pelajaran, server menelusuri sumber web, menyusun pertanyaan, empat opsi yang berkaitan, kunci jawaban, serta pembahasan. Paket harus memiliki 10 soal unik, empat opsi yang berbeda, kunci valid, pembahasan, dan setidaknya satu referensi Google Search agar diterima.
- Opsi jawaban diacak beserta indeks kuncinya agar posisi jawaban benar tidak selalu berada di huruf yang sama.
- Host dapat meninjau dan mengoreksi soal sebelum memulai timer. Referensi web untuk paket soal ditampilkan pada pratinjau.
- Mata pelajaran **Informatika diganti menjadi Pendidikan Agama Islam (PAI)**.
- Musik latar dihapus. Tombol audio hanya mengaktifkan atau menonaktifkan efek suara dan bunyi timer.
- Fitur lain tetap ada: 4 ronde utama, 10 soal per ronde, final Ilmu Ekonomi 10 soal, voting tingkat kesulitan final, timer soal 40 detik, penjelasan jawaban, skor real-time, tie-break, dashboard host, serta tantangan podium opsional.

## Persyaratan

- Node.js 20 atau lebih baru
- npm
- Koneksi internet untuk pembuatan soal berbasis Google Search
- Kunci Gemini API dari [Google AI Studio](https://aistudio.google.com/apikey)

Google Custom Search JSON API yang lama sudah ditutup untuk pelanggan baru. Proyek ini menggunakan fitur Gemini API **Grounding with Google Search**, yang melakukan pencarian, sintesis, dan menyediakan metadata rujukan web. Referensi resminya: https://ai.google.dev/gemini-api/docs/google-search

## Konfigurasi kunci API

1. Buka [Google AI Studio](https://aistudio.google.com/apikey) dan buat/salin kunci API Gemini.
2. Salin file `.env.example` menjadi `.env` di folder proyek.
3. Ganti placeholder berikut dengan kunci milikmu:

   ```env
   GEMINI_API_KEY=isi_kunci_api_di_sini
   GEMINI_MODEL=gemini-2.5-flash
   ```

4. Simpan `.env`. Server membaca ulang konfigurasi `.env` ketika host menekan **Coba Lagi** setelah pencarian gagal. File ini sudah dikecualikan dari Git.
5. Periksa `http://localhost:3000/api/config-status`. Respons yang benar menunjukkan `geminiApiKeyConfigured: true`; endpoint ini tidak pernah mengembalikan kunci rahasia.
6. Jangan pernah menaruh kunci API di `public/app.js`, `public/index.html`, atau tempat yang dikirim ke browser. Jangan mengirim kunci ke pemain lain.

Permintaan Gemini API dapat memiliki batas penggunaan atau biaya bergantung pada paket dan model yang aktif di akun Google. Periksa kuota dan harga resmi sebelum digunakan pada acara besar.

## Jalankan di komputer sendiri

```bash
npm install
npm test
npm start
```

Buka `http://localhost:3000`. Buat room di satu browser, kemudian buka browser/perangkat lain untuk tiga peserta. Ketika kombinasi kotak selesai dipilih, server akan mencari dan menyusun 10 soal. Tunggu proses pencarian selesai; host dapat memeriksa soal dan sumber sebelum menekan tombol mulai.

Endpoint pemeriksaan server tersedia di `GET /health`.

## Deploy agar dapat dimainkan melalui internet

Deploy sebagai satu layanan Node.js yang mendukung WebSocket (misalnya Render, Railway, atau VPS) dengan:

- Install/build: `npm install`
- Start: `npm start`
- Port: gunakan environment variable `PORT`
- Environment variable rahasia: `GEMINI_API_KEY` dan secara opsional `GEMINI_MODEL`

Atur `GEMINI_API_KEY` sebagai secret/environment variable di panel hosting, bukan sebagai file publik atau kode frontend. Gunakan satu instance server karena state room saat ini disimpan dalam memori.

## Sumber soal dan batasan

- Paket 10 soal setiap ronde utama dibuat ketika kombinasi mapel, jenjang, dan kesulitan sudah dipilih; soal tidak diambil mentah sebagai salinan penuh halaman web. Gemini menyusun soal berdasarkan penelusuran Google dan hasilnya tetap perlu diperiksa manusia.
- Sistem memvalidasi struktur dan kunci (jumlah opsi, indeks jawaban, pengulangan pertanyaan, pembahasan, dan referensi), tetapi pemeriksaan otomatis **tidak dapat menjamin sepenuhnya kebenaran akademik atau mutu setiap pengecoh**. Karena itu pratinjau host dan editor soal dipertahankan.
- Jika API gagal, kuota habis, atau referensi web tidak dikembalikan, game tidak memakai soal sintetis sebagai pengganti. Host dapat mengatur API key atau menekan Coba Lagi.
- Final Ilmu Ekonomi masih menggunakan 40 soal lokal yang sudah disediakan (10 untuk tiap tingkat kesulitan voting). Bank lokal pada `data/questions.js`/`data/question-expansion.js` tersedia untuk referensi dan tes, tetapi tidak dipakai sebagai fallback otomatis untuk ronde utama.

## Pengujian

```bash
npm test
node --check server.js
node --check public/app.js
node --check data/questions.js
node --check data/question-expansion.js
node --check services/google-questions.js
```

Tes meliputi struktur bank referensi lokal, pemanggilan API (mock), parsing/validasi paket soal, dan penanganan kondisi tanpa API key tanpa harus mengakses jaringan Google.

## Struktur proyek

```text
cerdas-cermat-online/
├── data/questions.js             # bank soal lokal referensi + final ekonomi
├── data/question-expansion.js    # seed materi referensi legacy, tidak dipakai runtime
├── services/google-questions.js  # prompt, pemanggilan Gemini Search, validasi soal
├── public/index.html             # shell frontend
├── public/app.js                 # tampilan dan interaksi Socket.IO
├── public/styles.css             # gaya visual responsif
├── server.js                     # room, timer, skor, dan pemilihan soal live
├── test/                         # pengujian otomatis
├── .env.example                  # contoh konfigurasi API (tanpa kunci asli)
└── package.json
```
