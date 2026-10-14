# Cerdas Cermat Online

Game kuis multiplayer berbasis web untuk tepat **1 host + 3 peserta**, dibuat dengan Node.js, Express, dan Socket.IO. Frontend responsif, sementara server menjadi sumber kebenaran untuk pilihan kotak, voting, timer, jawaban, skor, dan hasil.

## Fitur yang tersedia

- Room privat dengan kode 6 karakter dan tautan undangan.
- Lobby real-time, status siap, tutorial bersama, dan pemulihan koneksi menggunakan token sesi di browser.
- Empat ronde utama. Tiap ronde memiliki pemilihan kotak berurutan: kesulitan, jenjang pendidikan, lalu mata pelajaran.
- Bank lokal berisi 66 soal utama dan 40 soal Ilmu Ekonomi final. Setiap soal memiliki 4 pilihan, kunci, dan penjelasan; tidak ada pembuatan soal live.
- Paket utama berisi 10 soal per ronde dan tidak memakai ulang ID soal utama yang sudah dimainkan dalam satu sesi. Jika kombinasi kotak tidak tersedia, paket memilih soal dengan kecocokan terbaik dan host dapat mengganti mapel sebelum soal pertama. Host juga bisa mengoreksi teks soal, opsi, kunci, dan pembahasan sebelum soal diaktifkan atau saat pratinjau soal berikutnya.
- Voting kesulitan final yang rahasia bagi peserta dan terlihat rinci oleh host; hasil seri diselesaikan host.
- Timer soal 40 detik, kontrol jeda/lanjut/akhiri dari host, jawaban terkunci, serta pembahasan yang wajib terlihat setidaknya 8 detik dan tetap tampil sampai host melanjutkan.
- Skor server-authoritative, papan skor, tie-break jika peringkat tetap seri, audit aktivitas host, tantangan aman untuk juara kedua/ketiga, pilihan untuk melewati tantangan, kontrol akhiri ronde, dan reset sesi ke lobby.
- Antarmuka responsif, progress timer real-time, dan efek suara yang dapat dinonaktifkan.

## Persyaratan

- Node.js 20 atau lebih baru
- npm
- Koneksi internet hanya dibutuhkan antar-pemain saat menggunakan server yang dapat diakses publik. Dependensi diunduh saat instalasi.

## Jalankan di komputer sendiri

```bash
npm install
npm test
npm start
```

Buka `http://localhost:3000`. Buat room pada satu browser, lalu buka jendela privat atau perangkat lain untuk tiga peserta. Untuk pengujian dalam satu jaringan lokal, host dapat membagikan alamat LAN komputer beserta port `3000`, jika firewall mengizinkannya.

Health check tersedia di `GET /health`.

## Deploy agar bisa dimainkan lewat internet

Deploy sebagai **satu layanan Node.js yang selalu menjalankan satu instance** pada penyedia hosting yang mendukung WebSocket (misalnya Render, Railway, atau VPS). Gunakan pengaturan berikut:

- Build/install command: `npm install`
- Start command: `npm start`
- Health-check path: `/health` (opsional)
- Port: gunakan environment variable `PORT` yang diberikan penyedia; aplikasi sudah membacanya.

Setelah deploy, bagikan URL publik kepada host dan peserta. Host membuat room lalu membagikan kode atau tautan undangan.

### Catatan operasional

- Data room dan progres disimpan dalam memori proses. Room bertahan saat pemain menyegarkan halaman atau menyambung ulang selama proses server masih hidup, tetapi **hilang jika server dimulai ulang**. Ini disengaja agar setup sederhana; belum ada database permanen.
- Jalankan satu instance untuk menghindari room terpisah antar-instance. Jika nantinya memakai banyak instance, tambahkan adapter Socket.IO bersama dan penyimpanan state persisten.
- Token sesi untuk reconnect disimpan di `localStorage` browser. Jangan hapus data situs jika ingin menyambung ulang sebagai pemain lama.
- Browser modern direkomendasikan. Suara merupakan efek tambahan dan dapat dimatikan.

## Bank soal

Bank soal berada di `data/questions.js` dalam dua array:

- `MAIN_QUESTIONS`: 66 soal lintas mata pelajaran/jenjang/kesulitan untuk empat ronde utama.
- `ECONOMY_FINAL_QUESTIONS`: 40 soal Ilmu Ekonomi tingkat perguruan tinggi, terdiri dari 10 soal pada setiap tingkat kesulitan final.

Setiap entri memiliki `id`, `subject`, `level`, `difficulty`, `question`, `options` (empat opsi), `answer` (indeks 0–3), dan `explanation`. Untuk mengedit soal, pertahankan empat opsi dan pastikan `answer` menunjuk ke opsi yang benar. Jalankan `npm test` setelah mengubah bank soal. Untuk final, pertahankan minimal 10 soal pada setiap tingkat kesulitan yang dapat dipilih.

## Pengujian yang disertakan

```bash
npm test
node --check server.js
node --check public/app.js
node --check data/questions.js
```

Tes otomatis memeriksa kelengkapan metadata, keunikan ID, pilihan ganda, kunci jawaban, dan kuota 10 soal untuk setiap kesulitan final. Pemeriksaan manual end-to-end setelah server berjalan: buat satu room host, gabungkan tiga peserta dari browser/perangkat lain, tandai siap, konfirmasi aturan, lalu jalankan alur ronde, voting final, hasil, dan reconnect.

## Struktur

```text
cerdas-cermat-online/
├── data/questions.js       # bank soal offline/lokal (66 utama + 40 final ekonomi)
├── public/index.html       # shell frontend
├── public/styles.css       # UI responsif
├── public/app.js           # tampilan dan interaksi Socket.IO
├── server.js               # room, timer, validasi, voting, skor, dan kontrol host
├── test/questions.test.js  # validasi bank soal
├── package.json
├── Dockerfile
└── render.yaml
```
