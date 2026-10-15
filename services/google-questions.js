'use strict';

const crypto = require('crypto');

const LEVEL_LABELS = {
  sd: 'SD (Sekolah Dasar)',
  smp: 'SMP (Sekolah Menengah Pertama)',
  sma: 'SMA/SMK (Sekolah Menengah Atas/Kejuruan)',
  college: 'Perguruan Tinggi',
};
const DIFFICULTY_LABELS = {
  easy: 'Mudah',
  medium: 'Sedang',
  hard: 'Sulit',
  very_hard: 'Sangat Sulit',
};

function buildPrompt({ subject, level, difficulty, count = 10 }) {
  if (!Object.hasOwn(DIFFICULTY_LABELS, difficulty)) throw new Error(`Tingkat kesulitan tidak valid: ${difficulty}`);
  return `Anda adalah penyusun soal cerdas cermat untuk peserta Indonesia. Gunakan Google Search untuk mencari dan memverifikasi fakta dari sumber web tepercaya sebelum menyusun soal.

KONTEKS PAKET
- Mata pelajaran: ${subject}
- Tingkat pendidikan: ${LEVEL_LABELS[level] || level}
- Kesulitan: ${DIFFICULTY_LABELS[difficulty] || difficulty}
- Jumlah: tepat ${count} soal pilihan ganda
- Bahasa: Indonesia yang alami, jelas, dan sesuai usia peserta

ATURAN WAJIB
1. Buat pertanyaan dari fakta/konsep yang benar-benar didukung sumber web yang ditemukan, bukan membuat detail, kutipan, ayat, hadis, angka, atau peraturan fiktif.
2. Pilih materi inti yang sesuai dengan tingkat pendidikan dan mata pelajaran. Untuk Pendidikan Agama Islam, utamakan sumber Kementerian Agama, Quran Kemenag, atau lembaga pendidikan yang kredibel; tulis secara hormat dan hindari perdebatan mazhab yang tidak diperlukan.
3. Empat opsi harus berkaitan langsung dengan pertanyaan dan berada dalam kategori/konsep yang sama. Tiga pengecoh harus masuk akal bagi peserta yang belum memahami materi. DILARANG memakai opsi asal, lucu, tidak terkait, “semua jawaban benar”, atau “semua jawaban salah”.
4. Hanya boleh ada satu jawaban paling benar. Hindari soal ambigu, jebakan redaksi, pertanyaan opini, dan pertanyaan yang memerlukan informasi yang tidak disertakan.
5. Kesulitan harus nyata: Mudah = pemahaman dasar; Sedang = penerapan sederhana; Sulit = penerapan/penalaran beberapa langkah; Sangat Sulit = analisis lebih dalam sesuai jenjang.
6. Jangan menyalin soal dari situs secara verbatim. Susun ulang dengan kata-kata sendiri sambil mempertahankan fakta dan maknanya.
7. Pembahasan harus menjelaskan alasan jawaban benar secara singkat. Pastikan sesuai sumber yang ditemukan.
8. Sebelum mengembalikan hasil, periksa ulang setiap soal, kunci, dan semua pengecohnya terhadap sumber yang ditelusuri.
9. Keluarkan HANYA JSON valid, tanpa Markdown, pembuka, atau teks di luar JSON.

FORMAT JSON PERSIS:
{"questions":[{"question":"Teks soal?","options":["Opsi 1","Opsi 2","Opsi 3","Opsi 4"],"answer":0,"explanation":"Pembahasan faktual singkat."}]}

Kolom answer adalah indeks jawaban benar mulai dari 0 sampai 3. Buat tepat ${count} soal berbeda dan jangan mengulang pertanyaan.`;
}

function extractJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(raw); } catch (_err) { /* coba ambil objek di dalam teks */ }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Respons Google tidak berisi JSON soal yang valid.');
  try { return JSON.parse(raw.slice(start, end + 1)); }
  catch (_err) { throw new Error('Format paket soal dari layanan Google tidak valid. Silakan coba lagi.'); }
}

function normalizeAndValidateQuestions(payload, { subject, level, difficulty, count = 10 }) {
  if (!Object.hasOwn(DIFFICULTY_LABELS, difficulty)) throw new Error(`Tingkat kesulitan tidak valid: ${difficulty}`);
  const rows = Array.isArray(payload) ? payload : payload?.questions;
  if (!Array.isArray(rows) || rows.length !== count) {
    throw new Error(`Layanan web harus menghasilkan tepat ${count} soal; hasil kali ini tidak lengkap.`);
  }
  const seenQuestions = new Set();
  const result = rows.map((row, index) => {
    const question = String(row?.question || '').trim();
    const explanation = String(row?.explanation || '').trim();
    const options = Array.isArray(row?.options) ? row.options.map((option) => String(option ?? '').trim()) : [];
    let answer = row?.answer;
    if (typeof answer === 'string' && /^[A-D]$/i.test(answer.trim())) answer = answer.trim().toUpperCase().charCodeAt(0) - 65;
    answer = Number(answer);
    const questionKey = question.toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
    const normalizedOptions = options.map((option) => option.toLocaleLowerCase('id-ID'));
    if (question.length < 12 || question.length > 500) throw new Error(`Teks soal nomor ${index + 1} kosong atau terlalu panjang.`);
    if (seenQuestions.has(questionKey)) throw new Error('Layanan web mengembalikan pertanyaan yang berulang. Silakan buat paket ulang.');
    seenQuestions.add(questionKey);
    if (options.length !== 4 || options.some((option) => option.length < 1 || option.length > 240)) {
      throw new Error(`Soal nomor ${index + 1} harus memiliki empat opsi yang terisi.`);
    }
    if (new Set(normalizedOptions).size !== 4) throw new Error(`Pilihan jawaban soal nomor ${index + 1} harus berbeda.`);
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) throw new Error(`Kunci jawaban soal nomor ${index + 1} tidak valid.`);
    if (explanation.length < 8 || explanation.length > 1200) throw new Error(`Pembahasan soal nomor ${index + 1} tidak memadai.`);

    // Acak urutan jawaban agar kunci tidak cenderung berada pada huruf tertentu.
    const choices = options.map((text, choiceIndex) => ({ text, correct: choiceIndex === answer }));
    for (let i = choices.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(0, i + 1);
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return {
      id: `WEB-${crypto.randomUUID()}`,
      subject, level, difficulty,
      question, options: choices.map((choice) => choice.text),
      answer: choices.findIndex((choice) => choice.correct),
      explanation,
      generated: true,
      sourceMode: 'google-search-grounded',
    };
  });
  return result;
}

async function generateGroundedQuestionPack({ subject, level, difficulty, count = 10, apiKey, model = 'gemini-2.5-flash' }) {
  if (!apiKey) {
    const error = new Error('Kunci API Gemini belum diatur. Tambahkan GEMINI_API_KEY ke file .env agar soal dapat dicari dan diverifikasi lewat Google Search.');
    error.code = 'MISSING_GEMINI_API_KEY';
    throw error;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt({ subject, level, difficulty, count }) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(90000),
  });
  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = responseJson?.error?.message || `HTTP ${response.status}`;
    const error = new Error(`Pencarian soal gagal (${response.status}). Periksa API key, akses model, kuota, atau koneksi internet.`);
    error.code = 'GEMINI_REQUEST_FAILED';
    error.detail = detail;
    throw error;
  }

  const candidate = responseJson?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('\n');
  if (!text) throw new Error('Layanan Google tidak mengembalikan teks soal. Coba ulangi pencarian.');
  const grounding = candidate?.groundingMetadata || {};
  const sources = (grounding.groundingChunks || []).map((chunk) => chunk.web).filter((web) =>
    web && typeof web.uri === 'string' && /^https?:\/\//i.test(web.uri)
  ).map((web) => ({ title: String(web.title || 'Sumber web'), url: web.uri }))
    .filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index)
    .slice(0, 8);
  if (!sources.length) {
    throw new Error('Hasil belum dilengkapi referensi web dari Google Search, sehingga tidak digunakan. Silakan ulangi permintaan.');
  }

  const payload = extractJson(text);
  const questions = normalizeAndValidateQuestions(payload, { subject, level, difficulty, count });
  return {
    questions,
    meta: {
      sourceMode: 'google-search-grounded',
      total: questions.length,
      sources,
      searchQueries: Array.isArray(grounding.webSearchQueries) ? grounding.webSearchQueries.slice(0, 8) : [],
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = { buildPrompt, extractJson, normalizeAndValidateQuestions, generateGroundedQuestionPack };
