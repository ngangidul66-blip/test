'use strict';

// Rujukan materi online untuk bank soal lokal. Pertanyaan ditulis ulang secara orisinal
// berdasarkan cakupan materi dan fakta pada sumber; bukan salinan massal soal berhak cipta.
const SOURCES = {
  mathSd: {
    title: 'TKA Matematika SD — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-wajib/sd',
  },
  math: {
    title: 'TKA Matematika SMP — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-wajib/smp/Matematika',
  },
  indonesiaSd: {
    title: 'TKA Bahasa Indonesia SD — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-wajib/sd/bahasa-indonesia',
  },
  indonesiaSma: {
    title: 'TKA Bahasa Indonesia SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-wajib/sma/bahasa-indonesia',
  },
  english: {
    title: 'English Grammar Reference',
    organization: 'British Council LearnEnglish',
    url: 'https://learnenglish.britishcouncil.org/free-resources/grammar/english-grammar-reference',
  },
  academicWriting: {
    title: 'Paraphrasing — Purdue OWL',
    organization: 'Purdue University Online Writing Lab',
    url: 'https://owl.purdue.edu/owl/research_and_citation/using_research/quoting_paraphrasing_and_summarizing/paraphrasing.html',
  },
  academicHedging: {
    title: 'Genre Analysis and Hedging — Purdue Writing Lab',
    organization: 'Purdue University Writing Lab',
    url: 'https://owl.purdue.edu/owl/graduate_writing/documents/IWE_2020_Genre-Analysis-Transcript.pdf',
  },
  physics: {
    title: 'TKA Fisika SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/fisika',
  },
  chemistry: {
    title: 'TKA Kimia SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/kimia',
  },
  biology: {
    title: 'TKA Biologi SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/biologi',
  },
  economy: {
    title: 'TKA Ekonomi SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/ekonomi',
  },
  geography: {
    title: 'TKA Geografi SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/geografi',
  },
  history: {
    title: 'TKA Sejarah SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/sejarah',
  },
  ppkn: {
    title: 'TKA Pendidikan Pancasila dan Kewarganegaraan SMA — Pusat Asesmen Pendidikan',
    organization: 'Kementerian Pendidikan Dasar dan Menengah',
    url: 'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/Pendidikan-Pancasila-dan-Kewarganegaraan-Pendidikan-Pancasila',
  },
  pai: {
    title: 'Buku PAI dan Budi Pekerti — Direktorat Pendidikan Agama Islam',
    organization: 'Kementerian Agama Republik Indonesia',
    url: 'https://cendikia.kemenag.go.id/publik/buku_detail/334',
  },
  quran: {
    title: 'Qur’an Kemenag',
    organization: 'Kementerian Agama Republik Indonesia',
    url: 'https://quranindonesia.kemenag.go.id/',
  },
  bankIndonesia: {
    title: 'Edukasi Bank Indonesia',
    organization: 'Bank Indonesia',
    url: 'https://www.bi.go.id/id/edukasi/default.aspx',
  },
  bmkg: {
    title: 'E-learning Iklim dan Cuaca',
    organization: 'Badan Meteorologi, Klimatologi, dan Geofisika',
    url: 'https://cews.bmkg.go.id/elearning/index.html',
  },
  bmkgCurrentSeason: {
    title: 'Prediksi Musim Hujan 2026/2027 di Indonesia',
    organization: 'Badan Meteorologi, Klimatologi, dan Geofisika',
    url: 'https://www.bmkg.go.id/iklim/prediksi-musim/prediksi-musim-hujan-2026-2027-di-indonesia',
  },
  unescoMediaLiteracy: {
    title: 'Media and Information Literacy',
    organization: 'UNESCO',
    url: 'https://www.unesco.org/en/media-information-literacy',
  },
  cybersecurity: {
    title: 'Badan Siber dan Sandi Negara',
    organization: 'BSSN Republik Indonesia',
    url: 'https://www.bssn.go.id/',
  },
  plasticPollution: {
    title: 'Plastic Pollution',
    organization: 'United Nations Environment Programme',
    url: 'https://www.unep.org/plastic-pollution',
  },
  whoVaccines: {
    title: 'Vaccines and immunization: What is vaccination?',
    organization: 'World Health Organization',
    url: 'https://www.who.int/news-room/questions-and-answers/item/vaccines-and-immunization-what-is-vaccination',
  },
  unescoBio: {
    title: 'Biodiversity Education',
    organization: 'UNESCO',
    url: 'https://www.unesco.org/en/biodiversity/education',
  },
  nasaSolarSystem: {
    title: 'Solar System Exploration',
    organization: 'NASA',
    url: 'https://science.nasa.gov/solar-system/solar-system-facts/',
  },
  ombudsman: {
    title: 'Ombudsman Republik Indonesia',
    organization: 'Ombudsman RI',
    url: 'https://ombudsman.go.id/',
  },
  kpk: {
    title: 'Komisi Pemberantasan Korupsi',
    organization: 'KPK Republik Indonesia',
    url: 'https://www.kpk.go.id/id/',
  },
  bpk: {
    title: 'Badan Pemeriksa Keuangan',
    organization: 'BPK Republik Indonesia',
    url: 'https://www.bpk.go.id/',
  },
  ky: {
    title: 'Komisi Yudisial Republik Indonesia',
    organization: 'Komisi Yudisial',
    url: 'https://www.komisiyudisial.go.id/',
  },
  energyESDM: {
    title: 'Energi Baru Terbarukan dan Konservasi Energi',
    organization: 'Kementerian Energi dan Sumber Daya Mineral',
    url: 'https://ebtke.esdm.go.id/',
  },
};

function uniqueSources(items) {
  const seen = new Set();
  return items.filter((item) => item && !seen.has(item.url) && seen.add(item.url))
    .slice(0, 2)
    .map((item) => ({ ...item, kind: 'reference' }));
}

function getSourceReferences(subject, clue = '', level = '') {
  const text = String(clue || '').toLocaleLowerCase('id-ID');
  let sources = [];
  switch (subject) {
    case 'Matematika':
      sources = [level === 'sd' ? SOURCES.mathSd : SOURCES.math];
      break;
    case 'Bahasa Indonesia':
      sources = [level === 'sd' ? SOURCES.indonesiaSd : SOURCES.indonesiaSma];
      break;
    case 'Bahasa Inggris':
      sources = /hedging|rhetorical appeal|academic writing|paraphrase|source evaluation/.test(text)
        ? [SOURCES.academicHedging, SOURCES.academicWriting]
        : [SOURCES.english];
      break;
    case 'IPA':
      if (/energi angin|energi hidro|energi panas bumi|energi biomassa|sumber energi matahari/.test(text)) sources = [SOURCES.energyESDM, SOURCES.physics];
      else if (/asam|basa|atom dan ion|\bion\b|campuran|kesetimbangan|stoikiometri|kinetika|nernst|elektrode|redoks|reaksi kimia/.test(text)) sources = [SOURCES.chemistry, SOURCES.physics];
      else if (/genotipe|fenotipe|aktivitas enzim|gen|meiosis|seleksi alam|sel|fotosintesis|ekosistem|osmosis|difusi|respirasi|hardy|alosterik|rantai makanan|tumbuhan|nilai-p|ukuran efek|hipotesis nol|bias variabel/.test(text)) sources = [SOURCES.biology, SOURCES.unescoBio];
      else if (/penguapan|kondensasi|sublimasi|perubahan wujud|siklus air|iklim|matahari|energi|mencair|cuaca/.test(text)) sources = [SOURCES.bmkg, SOURCES.physics];
      else sources = [SOURCES.physics, SOURCES.biology];
      break;
    case 'IPS':
      if (/produksi|distribusi|konsumsi|inflasi|pendapatan|elastisitas|permintaan|penawaran|ekonomi|barang publik|kelangkaan|keunggulan komparatif|fiskal|gini/.test(text)) sources = [SOURCES.economy, SOURCES.bankIndonesia];
      else if (/peta|arah mata angin|sumber daya alam|kepadatan|urbanisasi|migrasi|lingkungan/.test(text)) sources = [SOURCES.geography, SOURCES.bmkg];
      else sources = [SOURCES.history, SOURCES.geography];
      break;
    case 'Sejarah':
      sources = [SOURCES.history];
      if (/proklamasi|rengasdengklok|bpupki|ppki|sumpah pemuda|bandung lautan api/.test(text)) sources.push({
        title: 'Sejarah Museum Perumusan Naskah Proklamasi',
        organization: 'Direktorat Jenderal Kebudayaan',
        url: 'https://kebudayaan.kemdikbud.go.id/sejarah-museum-perumusan-naskah-proklamasi-3/',
      });
      break;
    case 'Geografi':
      sources = [SOURCES.geography];
      if (/el niño|la niña|cuaca|iklim|hujan|angin|siklus hidrologi|daerah aliran sungai|infiltrasi/.test(text)) sources.unshift(SOURCES.bmkgCurrentSeason, SOURCES.bmkg);
      break;
    case 'PPKn':
      if (/ombudsman/.test(text)) sources = [SOURCES.ombudsman, SOURCES.ppkn];
      else if (/komisi pemberantasan korupsi|kpk/.test(text)) sources = [SOURCES.kpk, SOURCES.ppkn];
      else if (/badan pemeriksa keuangan|bpk/.test(text)) sources = [SOURCES.bpk, SOURCES.ppkn];
      else if (/komisi yudisial/.test(text)) sources = [SOURCES.ky, SOURCES.ppkn];
      else sources = [SOURCES.ppkn];
      break;
    case 'Ekonomi':
      sources = [SOURCES.economy];
      if (/bank sentral|inflasi|uang|pajak|moneter|sistem pembayaran|rupiah/.test(text)) sources.push(SOURCES.bankIndonesia);
      break;
    case 'Pendidikan Agama Islam':
      sources = [/al-qur|qur.an|tajwid|hadis|ayat|tabayyun|sujud tilawah|iman kepada kitab/.test(text) ? SOURCES.quran : SOURCES.pai, SOURCES.pai];
      break;
    case 'Pengetahuan Umum':
      if (/planet|tata surya|matahari sebagai bintang|satelit alam|gerhana matahari|fase bulan|rotasi bumi/.test(text)) sources = [SOURCES.nasaSolarSystem];
      else if (/h₂o|h2o|rumus kimia|atom dan ion|rumus molekul/.test(text)) sources = [SOURCES.chemistry];
      else if (/sistem pernapasan|alveolus/.test(text)) sources = [SOURCES.biology];
      else if (/vaksin|penyakit|jantung|vitamin|kesehatan|imun|antibiotik|organisasi kesehatan dunia/.test(text)) sources = [SOURCES.whoVaccines];
      else if (/gas rumah kaca|energi listrik|el niño|la niña/.test(text)) sources = [SOURCES.bmkgCurrentSeason, SOURCES.energyESDM];
      else if (/kriptografi|verifikasi informasi digital|hoaks digital|informasi palsu|phishing|keamanan dua faktor|privasi data|literasi digital|kecerdasan buatan generatif/.test(text)) sources = [SOURCES.cybersecurity, SOURCES.unescoMediaLiteracy];
      else if (/mikroplastik|polusi plastik|sampah plastik/.test(text)) sources = [SOURCES.plasticPollution, SOURCES.unescoBio];
      else if (/rantai makanan|ekosistem|fotosintesis|keanekaragaman hayati/.test(text)) sources = [SOURCES.unescoBio];
      else if (/keanekaragaman|konservasi|biodivers|ekosistem|pangan|daur ulang|lingkungan/.test(text)) sources = [SOURCES.unescoBio];
      else if (/iklim|cuaca|karbon|energi|samudra|kompas|pasang surut|arus laut/.test(text)) sources = [SOURCES.bmkg];
      else if (/bendera merah putih|garuda pancasila|lagu indonesia raya|lambang negara/.test(text)) sources = [SOURCES.ppkn];
      else if (/inflasi|portofolio|insentif ekonomi|rantai pasok|suku bunga|bank sentral|nilai tukar/.test(text)) sources = [SOURCES.bankIndonesia, SOURCES.economy];
      else sources = [SOURCES.unescoBio, SOURCES.bmkg];
      break;
    default:
      sources = [SOURCES.math];
  }
  return uniqueSources(sources);
}

module.exports = { SOURCES, getSourceReferences };
