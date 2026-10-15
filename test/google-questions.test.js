'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPrompt,
  extractJson,
  normalizeAndValidateQuestions,
  generateGroundedQuestionPack,
} = require('../services/google-questions');

function sampleRows(count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    question: `Dalam materi PAI, contoh penerapan prinsip ${i + 1} adalah ...?`,
    options: [`Penerapan A nomor ${i + 1}`, `Penerapan B nomor ${i + 1}`, `Penerapan C nomor ${i + 1}`, `Penerapan D nomor ${i + 1}`],
    answer: i % 4,
    explanation: `Opsi yang benar sesuai prinsip yang ditanyakan karena memiliki alasan yang relevan nomor ${i + 1}.`,
  }));
}

test('prompt meminta pencarian Google dan pengecoh relevan', () => {
  const prompt = buildPrompt({ subject: 'Pendidikan Agama Islam', level: 'smp', difficulty: 'hard' });
  assert.match(prompt, /Google Search/);
  assert.match(prompt, /pengecoh harus masuk akal/);
  assert.match(prompt, /tepat 10 soal/);
  assert.match(prompt, /Keluarkan HANYA JSON valid/);
  assert.throws(() => buildPrompt({ subject: 'IPA', level: 'sd', difficulty: 'bonus' }), /Tingkat kesulitan tidak valid/);
});

test('parser menerima JSON langsung dan JSON dalam code fence', () => {
  const object = { questions: sampleRows() };
  assert.equal(extractJson(JSON.stringify(object)).questions.length, 10);
  assert.equal(extractJson('```json\n' + JSON.stringify(object) + '\n```').questions.length, 10);
});

test('validator menolak paket tidak lengkap, opsi duplikat, atau kunci invalid', () => {
  assert.throws(() => normalizeAndValidateQuestions({ questions: sampleRows(9) }, { subject: 'Pendidikan Agama Islam', level: 'smp', difficulty: 'hard' }), /tepat 10 soal/);
  const duplicate = sampleRows(); duplicate[0].options[1] = duplicate[0].options[0];
  assert.throws(() => normalizeAndValidateQuestions({ questions: duplicate }, { subject: 'Pendidikan Agama Islam', level: 'smp', difficulty: 'hard' }), /harus berbeda/);
  const invalidKey = sampleRows(); invalidKey[0].answer = 8;
  assert.throws(() => normalizeAndValidateQuestions({ questions: invalidKey }, { subject: 'Pendidikan Agama Islam', level: 'smp', difficulty: 'hard' }), /Kunci jawaban/);
});

test('validator menghasilkan sepuluh ID unik dan mempertahankan jawaban benar saat opsi diacak', () => {
  const input = sampleRows();
  const normalized = normalizeAndValidateQuestions({ questions: input }, { subject: 'Pendidikan Agama Islam', level: 'smp', difficulty: 'hard' });
  assert.equal(normalized.length, 10);
  assert.equal(new Set(normalized.map((q) => q.id)).size, 10);
  for (let i = 0; i < normalized.length; i += 1) {
    const row = normalized[i];
    assert.equal(row.options.length, 4);
    assert.equal(row.options[row.answer], input[i].options[input[i].answer]);
    assert.equal(row.subject, 'Pendidikan Agama Islam');
    assert.equal(row.sourceMode, 'google-search-grounded');
  }
});

test('tanpa API key layanan tidak diam-diam memakai bank lokal', async () => {
  await assert.rejects(
    generateGroundedQuestionPack({ subject: 'IPA', level: 'sd', difficulty: 'easy', apiKey: '' }),
    (error) => error.code === 'MISSING_GEMINI_API_KEY' && /GEMINI_API_KEY/.test(error.message),
  );
});

test('permintaan paket memasang Google Search grounding dan mempertahankan sumber asli', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({ questions: sampleRows() }) }] },
          groundingMetadata: {
            webSearchQueries: ['contoh materi PAI SMP'],
            groundingChunks: [{ web: { uri: 'https://example.org/pai/materi', title: 'Materi PAI — sumber contoh' } }],
          },
        }],
      }),
    };
  };
  try {
    const result = await generateGroundedQuestionPack({
      subject: 'Pendidikan Agama Islam', level: 'smp', difficulty: 'medium', apiKey: 'test-secret', model: 'gemini-2.5-flash',
    });
    assert.match(captured.url, /gemini-2\.5-flash:generateContent/);
    const body = JSON.parse(captured.options.body);
    assert.deepEqual(body.tools, [{ google_search: {} }]);
    assert.equal(result.questions.length, 10);
    assert.equal(result.meta.sources[0].url, 'https://example.org/pai/materi');
    assert.deepEqual(result.meta.searchQueries, ['contoh materi PAI SMP']);
  } finally {
    global.fetch = originalFetch;
  }
});
