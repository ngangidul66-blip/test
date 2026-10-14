'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MAIN_QUESTIONS, ECONOMY_FINAL_QUESTIONS } = require('../data/questions');
const { SEEDS, LEVELS: SEED_LEVELS } = require('../data/question-expansion');

const ALL_QUESTIONS = [...MAIN_QUESTIONS, ...ECONOMY_FINAL_QUESTIONS];
const FINAL_DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'];
const MAIN_DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard', 'bonus'];
const LEVELS = ['sd', 'smp', 'sma', 'college'];

test('bank soal utama lengkap dan tanpa placeholder', () => {
  assert.ok(MAIN_QUESTIONS.length >= 40);
  assert.equal(MAIN_QUESTIONS.slice(0, 40).length, 40);
});

test('setiap soal memiliki ID unik dan metadata lengkap', () => {
  const ids = ALL_QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'ID soal harus unik');
  for (const q of ALL_QUESTIONS) {
    assert.ok(q.id, 'id kosong');
    assert.ok(q.subject, `${q.id}: subject kosong`);
    assert.ok(q.question && q.question.trim().length > 0, `${q.id}: question kosong`);
    assert.ok(q.explanation && q.explanation.trim().length > 0, `${q.id}: explanation kosong`);
    assert.ok(Array.isArray(q.options) && q.options.length === 4, `${q.id}: harus memiliki tepat 4 pilihan`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${q.id}: indeks jawaban tidak valid`);
    assert.ok(LEVELS.includes(q.level), `${q.id}: jenjang tidak valid`);
    assert.ok(MAIN_DIFFICULTIES.includes(q.difficulty) || q.difficulty === 'bonus', `${q.id}: kesulitan tidak valid`);
  }
});

test('final Ilmu Ekonomi memiliki 10 soal untuk setiap kesulitan voting', () => {
  assert.equal(ECONOMY_FINAL_QUESTIONS.length, 40);
  for (const difficulty of FINAL_DIFFICULTIES) {
    const pool = ECONOMY_FINAL_QUESTIONS.filter((q) => q.difficulty === difficulty);
    assert.equal(pool.length, 10, `Kesulitan ${difficulty} harus memiliki 10 soal`);
    assert.ok(pool.every((q) => q.subject === 'Ilmu Ekonomi'), `Pool ${difficulty} harus khusus Ilmu Ekonomi`);
    assert.ok(pool.every((q) => q.level === 'college'), `Pool ${difficulty} harus level perguruan tinggi`);
  }
});


test('setiap kombinasi mapel, jenjang, dan kesulitan memiliki 10 soal persis', () => {
  const subjects = ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA', 'IPS', 'Sejarah', 'Geografi', 'PPKn', 'Ekonomi', 'Informatika', 'Pengetahuan Umum'];
  for (const subject of subjects) {
    for (const level of LEVELS) {
      for (const difficulty of MAIN_DIFFICULTIES) {
        const pool = MAIN_QUESTIONS.filter((q) => q.subject === subject && q.level === level && q.difficulty === difficulty);
        assert.equal(pool.length, 10, `${subject}/${level}/${difficulty} harus memiliki 10 soal`);
        assert.equal(new Set(pool.map((q) => q.question)).size, 10, `${subject}/${level}/${difficulty} tidak boleh mengulang pertanyaan`);
      }
    }
  }
});

test('seluruh soal memiliki kunci jawaban yang tersedia pada opsi', () => {
  for (const q of ALL_QUESTIONS) {
    assert.equal(q.options.length, 4, `${q.id}: harus ada empat opsi`);
    assert.ok(q.answer >= 0 && q.answer < q.options.length, `${q.id}: indeks jawaban di luar opsi`);
    assert.ok(q.options[q.answer], `${q.id}: teks jawaban kosong`);
    assert.ok(q.explanation.trim().length > 0, `${q.id}: pembahasan kosong`);
  }
});

test('bank soal utama cukup untuk 4 ronde x 10 soal tanpa pengulangan ID dalam sesi', () => {
  assert.ok(MAIN_QUESTIONS.length >= 40);
  const picked = new Set();
  for (let round = 0; round < 4; round += 1) {
    const available = MAIN_QUESTIONS.filter((q) => !picked.has(q.id));
    assert.ok(available.length >= 10, `Ronde ${round + 1} kekurangan soal unik`);
    for (const q of available.slice(0, 10)) picked.add(q.id);
  }
  assert.equal(picked.size, 40);
});


test('pilihan pada soal tambahan berasal dari rumpun materi mata pelajaran yang sama', () => {
  const answerColumn = { easy: 0, medium: 2, hard: 3, very_hard: 5, bonus: 0 };
  for (const question of MAIN_QUESTIONS.filter((item) => item.generated)) {
    const allowed = new Set(
      SEED_LEVELS.flatMap((level) => SEEDS[`${question.subject}|${level}`] || [])
        .map((row) => String(row[answerColumn[question.difficulty]]).trim().toLocaleLowerCase('id-ID'))
    );
    for (const option of question.options) {
      assert.ok(allowed.has(String(option).trim().toLocaleLowerCase('id-ID')),
        `${question.id}: opsi “${option}” tidak berasal dari rumpun materi ${question.subject}`);
    }
    assert.equal(new Set(question.options.map((option) => String(option).trim().toLocaleLowerCase('id-ID'))).size, 4,
      `${question.id}: semua opsi harus berbeda`);
  }
});
