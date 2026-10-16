'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MAIN_QUESTIONS, ECONOMY_FINAL_QUESTIONS } = require('../data/questions');
const { LOCAL_QUESTION_BANK, SUBJECTS, LEVELS, DIFFICULTIES } = require('../services/local-question-bank');

test('bank utama lama sudah tidak berisi soal aktif', () => {
  assert.equal(MAIN_QUESTIONS.length, 0);
  assert.equal(LOCAL_QUESTION_BANK.length, 2640);
  for (const subject of SUBJECTS) for (const level of LEVELS) for (const difficulty of DIFFICULTIES) {
    assert.equal(LOCAL_QUESTION_BANK.filter(q => q.subject === subject && q.level === level && q.difficulty === difficulty).length, 20);
  }
});

test('final Ekonomi berisi 30 pertanyaan baru dengan 10 soal per tingkat kesulitan', () => {
  assert.equal(ECONOMY_FINAL_QUESTIONS.length, 30);
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const questions = ECONOMY_FINAL_QUESTIONS.filter(q => q.difficulty === difficulty);
    assert.equal(questions.length, 10, `Ekonomi ${difficulty}`);
    for (const q of questions) {
      assert.equal(q.subject, 'Ekonomi');
      assert.equal(q.level, 'college');
      assert.equal(q.options.length, 3, q.question);
      assert.equal(q.options.length, new Set(q.options).size, q.question);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.question);
      assert.ok(q.explanation && q.explanation.length >= 8, q.question);
    }
  }
});

test('file pembangkit template lama dihapus dari proyek', () => {
  const root = path.join(__dirname, '..');
  assert.equal(fs.existsSync(path.join(root, 'data/question-expansion.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'data/source-grounded-additions.json')), false);
});
