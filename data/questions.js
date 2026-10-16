'use strict';

// Bank utama lama telah dihapus. Bank aktif yang dipakai host ada di classic-questions.js.
const MAIN_QUESTIONS = [];
let id = 1;
function finalQ(difficulty, question, options, correctText, explanation) {
  return {
    id: `ECON-FINAL-${String(id++).padStart(3, '0')}`,
    subject: 'Ekonomi', level: 'college', difficulty, question, options,
    answer: options.indexOf(correctText), explanation, finalOnly: true,
    sourceMode: 'classic-curated',
    sourceRefs: [
      { url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/ekonomi', title: 'TKA Ekonomi — Pusat Asesmen Pendidikan', kind: 'reference' },
      { url: 'https://www.bi.go.id/id/edukasi/default.aspx', title: 'Edukasi Bank Indonesia', kind: 'reference' },
    ],
  };
}

// Final Ekonomi juga ditulis ulang; tidak mengambil lagi paket final versi sebelumnya.
const ECONOMY_FINAL_QUESTIONS = [
  // Mudah (10)
  finalQ('easy', 'Ilmu ekonomi terutama mempelajari cara manusia ...', ['memilih penggunaan sumber daya yang terbatas', 'menghilangkan semua pilihan ekonomi', 'menghapus kelangkaan sumber daya'], 'memilih penggunaan sumber daya yang terbatas', 'Ekonomi mempelajari pilihan ketika sumber daya terbatas sedangkan kebutuhan beragam.'),
  finalQ('easy', 'Kegiatan menghasilkan barang atau jasa disebut ...', ['produksi', 'konsumsi', 'distribusi'], 'produksi', 'Produksi menghasilkan barang atau jasa.'),
  finalQ('easy', 'Orang yang memakai barang untuk memenuhi kebutuhannya disebut ...', ['konsumen', 'produsen', 'distributor'], 'konsumen', 'Konsumen menggunakan barang atau jasa.'),
  finalQ('easy', 'Balas jasa yang diterima pekerja atas tenaga kerjanya disebut ...', ['upah', 'sewa', 'bunga'], 'upah', 'Upah adalah balas jasa untuk tenaga kerja.'),
  finalQ('easy', 'Kegiatan menjual barang ke luar negeri disebut ...', ['ekspor', 'impor', 'konsumsi'], 'ekspor', 'Ekspor adalah penjualan barang atau jasa ke luar negeri.'),
  finalQ('easy', 'Uang yang tidak dibelanjakan dan disimpan untuk masa depan disebut ...', ['tabungan', 'pajak', 'subsidi'], 'tabungan', 'Tabungan adalah bagian pendapatan yang disisihkan untuk masa depan.'),
  finalQ('easy', 'Mata uang resmi Indonesia adalah ...', ['rupiah', 'ringgit', 'yen'], 'rupiah', 'Rupiah merupakan mata uang Indonesia.'),
  finalQ('easy', 'Kenaikan harga umum secara terus-menerus disebut ...', ['inflasi', 'deflasi', 'devaluasi'], 'inflasi', 'Inflasi adalah kenaikan tingkat harga umum secara berkelanjutan.'),
  finalQ('easy', 'Pajak merupakan salah satu sumber penerimaan ...', ['negara', 'rumah tangga pribadi', 'perusahaan swasta'], 'negara', 'Pajak digunakan untuk membiayai fungsi dan layanan publik.'),
  finalQ('easy', 'Barang atau jasa yang dipakai untuk memenuhi kebutuhan disebut ...', ['barang atau jasa konsumsi', 'faktor produksi', 'biaya peluang'], 'barang atau jasa konsumsi', 'Konsumsi mencakup pemanfaatan barang dan jasa untuk memenuhi kebutuhan.'),

  // Sedang (10)
  finalQ('medium', 'Jika harga suatu barang naik dan faktor lain tetap, jumlah yang diminta biasanya ...', ['menurun', 'meningkat', 'cenderung tetap'], 'menurun', 'Hukum permintaan menyatakan hubungan berlawanan antara harga dan jumlah yang diminta, dengan faktor lain tetap.'),
  finalQ('medium', 'Jika harga jual naik dan biaya lain tetap, jumlah yang ditawarkan produsen biasanya ...', ['meningkat', 'menurun', 'tidak berubah'], 'meningkat', 'Hukum penawaran menunjukkan harga lebih tinggi cenderung mendorong jumlah yang ditawarkan lebih tinggi.'),
  finalQ('medium', 'Biaya peluang adalah ...', ['nilai alternatif terbaik yang dilepaskan ketika memilih', 'jumlah seluruh uang dalam rekening', 'harga yang ditetapkan pemerintah untuk semua barang'], 'nilai alternatif terbaik yang dilepaskan ketika memilih', 'Biaya peluang menunjukkan nilai pilihan terbaik yang tidak jadi diambil.'),
  finalQ('medium', 'Kondisi ketika jumlah yang diminta sama dengan jumlah yang ditawarkan disebut ...', ['keseimbangan pasar', 'surplus pasar', 'kelebihan permintaan'], 'keseimbangan pasar', 'Pada keseimbangan pasar, jumlah permintaan sama dengan jumlah penawaran.'),
  finalQ('medium', 'Produk Domestik Bruto menghitung nilai barang dan jasa akhir yang diproduksi ...', ['di dalam wilayah suatu negara dalam periode tertentu', 'hanya oleh perusahaan milik pemerintah', 'hanya yang dijual ke luar negeri'], 'di dalam wilayah suatu negara dalam periode tertentu', 'PDB mengukur produksi akhir di wilayah domestik dalam periode tertentu.'),
  finalQ('medium', 'Kebijakan fiskal terutama menggunakan instrumen ...', ['pajak dan belanja pemerintah', 'pengaturan suku bunga oleh bank sentral', 'penetapan kurs valuta asing'], 'pajak dan belanja pemerintah', 'Kebijakan fiskal memengaruhi perekonomian melalui penerimaan pajak dan pengeluaran pemerintah.'),
  finalQ('medium', 'Lembaga yang menjalankan kebijakan moneter Indonesia adalah ...', ['Bank Indonesia', 'Badan Pemeriksa Keuangan', 'Badan Pusat Statistik'], 'Bank Indonesia', 'Bank Indonesia menjalankan mandat kebijakan moneter dan tugas bank sentral.'),
  finalQ('medium', 'Nilai alternatif yang dikorbankan saat menggunakan satu jam untuk bekerja daripada beristirahat merupakan contoh ...', ['biaya peluang', 'inflasi', 'ekspor neto'], 'biaya peluang', 'Waktu untuk beristirahat adalah alternatif yang dilepaskan ketika memilih bekerja.'),
  finalQ('medium', 'Jika impor lebih besar daripada ekspor, nilai ekspor neto adalah ...', ['negatif', 'positif', 'sama dengan nilai ekspor'], 'negatif', 'Ekspor neto dihitung sebagai ekspor dikurangi impor.'),
  finalQ('medium', 'Jika pendapatan meningkat dan suatu barang adalah barang normal, permintaannya cenderung ...', ['meningkat', 'menurun', 'hilang seluruhnya'], 'meningkat', 'Permintaan barang normal umumnya naik ketika pendapatan konsumen meningkat.'),

  // Sulit (10)
  finalQ('hard', 'Total biaya Rp240.000 untuk menghasilkan 60 unit. Biaya rata-rata per unit adalah ...', ['Rp4.000', 'Rp2.000', 'Rp6.000'], 'Rp4.000', 'Biaya rata-rata = Rp240.000 dibagi 60 unit = Rp4.000 per unit.'),
  finalQ('hard', 'Ekspor sebesar Rp80 miliar dan impor Rp95 miliar menghasilkan ekspor neto sebesar ...', ['−Rp15 miliar', 'Rp15 miliar', 'Rp175 miliar'], '−Rp15 miliar', 'Ekspor neto = 80 − 95 = −15 miliar rupiah.'),
  finalQ('hard', 'Indeks harga naik dari 100 menjadi 110. Kenaikan indeks tersebut adalah ...', ['10%', '5%', '11%'], '10%', 'Kenaikan = (110 − 100) ÷ 100 × 100% = 10%.'),
  finalQ('hard', 'Jika kecenderungan mengonsumsi marginal (MPC) = 0,75, pengganda sederhana adalah ...', ['4', '3', '5'], '4', 'Pengganda = 1 ÷ (1 − MPC) = 1 ÷ 0,25 = 4.'),
  finalQ('hard', 'Perusahaan mengalami biaya bahan baku yang lebih tinggi. Kurva penawaran biasanya bergeser ke ...', ['kiri', 'kanan', 'tidak berubah dalam semua keadaan'], 'kiri', 'Biaya produksi yang meningkat mengurangi jumlah yang ditawarkan pada setiap tingkat harga.'),
  finalQ('hard', 'Pajak Pigouvian bertujuan mengatasi ...', ['eksternalitas negatif', 'barang inferior', 'monopoli pasar'], 'eksternalitas negatif', 'Pajak Pigouvian dirancang agar biaya eksternal, misalnya polusi, masuk dalam keputusan pelaku.'),
  finalQ('hard', 'Dalam persaingan sempurna, perusahaan memaksimalkan laba pada output yang sesuai ketika ...', ['harga sama dengan biaya marginal', 'harga sama dengan biaya rata-rata total pada semua output', 'harga sama dengan biaya tetap per unit'], 'harga sama dengan biaya marginal', 'Dalam kondisi optimal yang sesuai, perusahaan kompetitif memilih output ketika P = MR = MC.'),
  finalQ('hard', 'PDB riil berbeda dari PDB nominal karena PDB riil mengendalikan perubahan ...', ['tingkat harga', 'pendapatan konsumen', 'total luas wilayah'], 'tingkat harga', 'PDB riil memakai harga konstan untuk memisahkan perubahan output dari perubahan harga.'),
  finalQ('hard', 'Kurva Lorenz yang semakin jauh dari garis pemerataan sempurna menunjukkan ...', ['ketimpangan pendapatan lebih tinggi', 'ketimpangan pendapatan lebih rendah', 'pendapatan rata-rata meningkat'], 'ketimpangan pendapatan lebih tinggi', 'Semakin jauh kurva Lorenz dari garis pemerataan, semakin besar ketimpangan distribusi pendapatan.'),
  finalQ('hard', 'Elastisitas harga permintaan mengukur seberapa responsif jumlah yang diminta terhadap perubahan ...', ['harga barang', 'pendapatan konsumen', 'harga barang lain'], 'harga barang', 'Elastisitas harga permintaan membandingkan perubahan persentase jumlah diminta dengan perubahan persentase harga.'),
];

module.exports = { MAIN_QUESTIONS, ECONOMY_FINAL_QUESTIONS };
