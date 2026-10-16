'use strict';

const { CLASSIC_QUESTIONS } = require('../data/classic-questions');
const { SUBJECTS, LEVELS, DIFFICULTIES } = require('../data/question-config');
const crypto = require('crypto');

// Bank ini menggantikan seluruh generator pertanyaan lama. Aplikasi hanya mengambil
// pertanyaan yang sudah memiliki opsi dan kunci jawaban yang dibuat sebagai satu paket.
const LOCAL_QUESTION_BANK = CLASSIC_QUESTIONS.map((question) => ({
  ...question,
  options: [...question.options],
  sourceRefs: [...question.sourceRefs],
  sourceMode: 'local-bank',
}));
const CURATED_QUESTIONS = LOCAL_QUESTION_BANK;
const SUPPLEMENTAL_QUESTIONS = [];

function getLocalQuestionPack({ subject, level, difficulty, count = 10, excludeIds = new Set(), excludeConceptKeys = new Set() }) {
  if (!SUBJECTS.includes(subject) || !LEVELS.includes(level) || !DIFFICULTIES.includes(difficulty)) {
    throw new Error('Kombinasi soal lokal tidak valid.');
  }
  const pool = LOCAL_QUESTION_BANK.filter((question) =>
    question.subject === subject && question.level === level && question.difficulty === difficulty
  );
  const available = pool.filter((question) => !excludeIds.has(question.id) && !excludeConceptKeys.has(question.conceptKey));
  const selectionPool = available.length >= count ? available : pool;
  if (selectionPool.length < count) {
    throw new Error(`Bank soal ${subject}/${level}/${difficulty} hanya memiliki ${selectionPool.length} soal; dibutuhkan ${count}.`);
  }
  const candidates = [...selectionPool];
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, count).map((question) => ({ ...question, options: [...question.options] }));
}

module.exports = {
  LOCAL_QUESTION_BANK,
  CURATED_QUESTIONS,
  SUPPLEMENTAL_QUESTIONS,
  getLocalQuestionPack,
  SUBJECTS,
  LEVELS,
  DIFFICULTIES,
};
