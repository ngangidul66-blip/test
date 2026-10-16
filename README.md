# Cerdas Cermat Online

Game kuis multiplayer berbasis web untuk **1 host + 3 peserta**, dibuat dengan Node.js, Express, dan Socket.IO. Server menangani room, pemilihan kotak, timer, jawaban, skor, voting, tie-break, dan hasil.

## Bank soal cerdas cermat

Bank utama telah diganti. Aplikasi tidak lagi memakai pembangkit pertanyaan generik dari definisi/contoh/skenario karena format itu pernah menghasilkan pertanyaan dan pengecoh yang terasa tidak nyambung. Semua soal aktif sekarang ditulis sebagai satu paket berisi teks soal, tiga opsi yang satu kategori dengan pertanyaan, indeks jawaban benar, pembahasan, serta tautan referensi materi.

Bank terdiri dari **660 soal cerdas cermat yang ditulis langsung** dalam 11 mata pelajaran (20 soal untuk setiap kombinasi mata pelajaran dan tingkat kesulitan), masing-masing tersedia pada jenjang SD, SMP, SMA/SMK, dan Perguruan Tinggi. Totalnya 2.640 entri bank setelah soal lintas jenjang dipetakan ke pilihan jenjang di game. Tingkat kesulitan tetap Mudah, Sedang, dan Sulit. Sistem memilih 10 dari 20 soal untuk setiap paket, sehingga paket bisa bervariasi.

Sumber yang dijadikan acuan cakupan/topik antara lain artikel cerdas cermat dari Popmama, Indotrends, Wislah, Tirto, dan ITERA, serta referensi materi resmi yang relevan. Redaksi soal ditulis ulang sebagai pertanyaan kuis; tautan adalah rujukan materi, bukan klaim bahwa setiap kalimat disalin langsung dari artikel. Tidak ada salinan massal satu artikel.

## Fitur yang dipertahankan

- Tiga tingkat kesulitan: Mudah (10 poin), Sedang (20 poin), dan Sulit (30 poin).
- Pilihan jawaban **3 opsi**, kunci jawaban, pembahasan, pengacakan urutan opsi, dan editor host untuk meninjau/mengoreksi soal dengan 2–3 opsi.
- Mata pelajaran Informatika telah diganti dengan **Pendidikan Agama Islam (PAI)**.
- Tidak ada musik latar; efek suara dan bunyi timer tetap tersedia.
- Durasi menjawab mengikuti kesulitan: Mudah 20 detik, Sedang 30 detik, dan Sulit 40 detik (termasuk soal tie-break berdasarkan kesulitan final). Pembahasan/kunci jawaban tampil selama 5 detik sebelum host dapat melanjutkan.
- Final Ilmu Ekonomi menggunakan tiga kotak misteri untuk voting tingkat kesulitan. Isi setiap kotak disembunyikan selama voting dan baru diungkap setelah voting selesai.
- Tombol fullscreen tersedia pada header untuk menampilkan game memenuhi layar; gunakan tombol yang sama untuk keluar dari fullscreen.
- Tampilan diperbarui dengan warna khusus pada kotak misteri, soal, opsi jawaban, hasil benar/salah, serta kotak final.
- Warna area permainan, kartu soal, pertanyaan, tombol jawaban, dan kotak final menggunakan blok warna solid (bukan hanya gradasi). Soal yang belum dimulai dan pratinjau soal berikutnya hanya dikirim ke host; peserta melihat layar tunggu sampai host memulai soal.
- Empat ronde utama, 10 soal per ronde, final Ekonomi 10 soal sesuai tingkat kesulitan hasil voting, timer, skor real-time, tie-break, dashboard host, serta tantangan podium opsional.
- Semua soal ronde utama diambil dari bank lokal, sehingga game dapat berjalan tanpa API key atau layanan eksternal.

## Menjalankan secara lokal

Node.js 20 atau lebih baru diperlukan. Di Windows PowerShell, jika `npm` terhalang execution policy, gunakan `npm.cmd`:

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

Buka `http://localhost:3000`. Buat room di satu browser, lalu buka browser/perangkat lain untuk peserta. Setelah tiga kotak selesai dipilih, game menyiapkan 10 soal dari bank lokal. Host dapat memeriksa dan mengoreksi pertanyaan serta kunci sebelum timer dimulai.

Endpoint pemeriksaan tersedia di `GET /health` dan `GET /api/question-bank-status`. Endpoint status bank melaporkan jumlah entri dan menegaskan bahwa API eksternal tidak diperlukan.

## Deploy

Deploy satu layanan Node.js yang mendukung WebSocket dengan:

- Install: `npm install`
- Start: `npm start`
- Port: environment variable `PORT`

State room disimpan dalam memori, jadi gunakan satu instance server. Bank soal dibundel dalam proyek dan tidak memerlukan penyimpanan eksternal.

## Catatan mutu

Pengujian otomatis memeriksa jumlah soal di setiap kategori, jumlah opsi, kecocokan indeks jawaban, pembahasan, dan tautan referensi. Tes tersebut bukan pengganti peninjauan isi secara manusiawi; khusus untuk lomba resmi, host sebaiknya tetap meninjau pertanyaan yang melibatkan fakta yang dapat berubah atau istilah yang memiliki variasi kurikulum.

## Struktur utama

```text
cerdas-cermat-online/
├── data/questions.js              # final Ekonomi yang ditulis ulang
├── data/classic-questions.js      # bank soal pengganti dan referensi materi
├── data/question-config.js       # pilihan mata pelajaran, jenjang, kesulitan
├── services/local-question-bank.js # pemilih paket soal lokal
├── public/                        # HTML, CSS, JS
├── server.js                      # room, timer, skor, pemilihan soal
└── test/                          # pengujian otomatis
```

Jalankan `npm test` untuk pengujian ulang.


## Kontrol skor dan hukuman podium

- Host dapat mengurangi 5, 10, atau 20 poin dari peserta melalui dashboard selama pertandingan. Server memverifikasi peran host dan identitas peserta; skor tidak akan menjadi negatif.
- Setelah pertandingan, host memutar roulette hukuman untuk juara 2 dan juara 3. Pilihannya: Konser dadakan, Joget kemenangan, Tirukan hewan, Ekspresi teraneh, Next jadi Host, Roll depan, dan Push-up 20x. Hasil tampil sesudah animasi roda berhenti. Tantangan fisik hanya dilakukan bila aman dan sesuai kemampuan; peserta boleh melewati tantangan yang tidak nyaman. Jika hasilnya Next jadi Host dan tidak dilewati, peran host berpindah ketika sesi baru dimulai.
