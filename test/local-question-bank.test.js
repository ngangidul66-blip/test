'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getLocalQuestionPack, LOCAL_QUESTION_BANK, SUBJECTS, LEVELS, DIFFICULTIES } = require('../services/local-question-bank');

test('setiap kombinasi mata pelajaran, jenjang, dan kesulitan punya 20 soal yang sudah ditulis lengkap', () => {
  assert.equal(SUBJECTS.length, 11);
  assert.deepEqual(DIFFICULTIES, ['easy', 'medium', 'hard']);
  assert.deepEqual(LEVELS, ['sd', 'smp', 'sma', 'college']);
  for (const subject of SUBJECTS) for (const level of LEVELS) for (const difficulty of DIFFICULTIES) {
    const pool = LOCAL_QUESTION_BANK.filter(q => q.subject === subject && q.level === level && q.difficulty === difficulty);
    assert.equal(pool.length, 20, `${subject}/${level}/${difficulty} harus memiliki 20 soal terkurasi`);
    const pack = getLocalQuestionPack({ subject, level, difficulty, count: 10 });
    assert.equal(pack.length, 10);
    assert.equal(new Set(pack.map(q => q.id)).size, 10);
    assert.equal(new Set(pack.map(q => q.conceptKey)).size, 10);
    assert.ok(pack.every(q => q.subject === subject && q.level === level && q.difficulty === difficulty));
  }
});

test('setiap soal memiliki 3 opsi berbeda, jawaban benar valid, pembahasan, dan rujukan HTTPS', () => {
  assert.equal(LOCAL_QUESTION_BANK.length, 2640);
  for (const q of LOCAL_QUESTION_BANK) {
    assert.equal(q.options.length, 3, q.id);
    assert.equal(new Set(q.options.map(x => String(x).trim())).size, 3, q.id);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id);
    assert.ok(q.options[q.answer], q.id);
    assert.ok(q.explanation && q.explanation.length >= 8, q.id);
    assert.ok(q.sourceRefs?.length, q.id);
    assert.ok(q.sourceRefs.every(ref => /^https:\/\//i.test(ref.url)), q.id);
    assert.equal(q.sourceMode, 'local-bank');
    assert.equal(q.generated, false, `${q.id} seharusnya bukan soal hasil generasi pola`);
  }
});

test('bank tidak menggunakan ulang konsep lama yang menghasilkan pertanyaan template', () => {
  assert.ok(LOCAL_QUESTION_BANK.some(q => q.question === 'Siapakah presiden pertama Republik Indonesia?'));
  assert.ok(LOCAL_QUESTION_BANK.some(q => q.question === 'Berapakah hasil 9 × 6?'));
  assert.ok(LOCAL_QUESTION_BANK.every(q => !/Kesimpulan yang tepat adalah|Apa pengertian [A-Z][a-z]+\?|Manakah contoh [A-Z]/u.test(q.question)));
});
