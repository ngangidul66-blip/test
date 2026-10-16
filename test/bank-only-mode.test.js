'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('runtime server takes every main-round pack directly from local bank', () => {
  const server = read('server.js');
  assert.match(server, /getLocalQuestionPack\(/);
  assert.doesNotMatch(server, /questionLoadId|question_loading|isCurrentQuestionLoad/);
  assert.match(server, /reload_question_bank/);
  assert.match(server, /sourceMode: 'local-bank'/);
  assert.doesNotMatch(server, /generateQuestionPack|getGeminiConfig|GEMINI_API_KEY|google_search|Google Search|Gemini/);
  assert.doesNotMatch(server, /getCachedQuestionPack|setCachedQuestionPack/);
});

test('AI generator, API cache, and environment loader are removed from project', () => {
  for (const rel of ['services/gemini-questions.js', 'services/question-pack-cache.js', 'env.js', '.env.example']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} seharusnya sudah dihapus`);
  }
});

test('frontend no longer describes AI/API generation or quota fallback', () => {
  const app = read('public/app.js');
  assert.doesNotMatch(app, /Gemini|GEMINI_API_KEY|Google Search|kuota gratis habis|API key/i);
  assert.match(app, /bank soal lokal/i);
});

test('API status endpoint reports local bank only, with no key/model status', () => {
  const server = read('server.js');
  assert.match(server, /\/api\/question-bank-status/);
  assert.doesNotMatch(server, /\/api\/config-status|geminiApiKeyConfigured|GEMINI_MODEL/);
});
