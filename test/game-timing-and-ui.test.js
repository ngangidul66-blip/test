'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

test('timer soal mengikuti tingkat kesulitan: 20, 30, dan 40 detik', () => {
  assert.match(server, /QUESTION_SECONDS_BY_DIFFICULTY\s*=\s*\{\s*easy:\s*20,\s*medium:\s*30,\s*hard:\s*40\s*\}/);
  assert.match(server, /const durationMs = questionDurationSeconds\(room\) \* 1000/);
  assert.match(server, /questionDurationSeconds:\s*questionDurationSeconds\(room\)/);
  assert.match(app, /state\.questionDurationSeconds/);
  assert.match(app, /Mudah 20 detik, Sedang 30 detik, dan Sulit 40 detik/);
});

test('pembahasan dan kunci jawaban dibatasi minimal 5 detik', () => {
  assert.match(server, /const REVIEW_SECONDS = 5/);
  assert.match(server, /Pembahasan harus tampil setidaknya 5 detik/);
  assert.match(app, /timerWidget\('review', gate, remaining, 5000, false\)/);
  assert.match(app, /duration = 5000; type = 'review'/);
  assert.doesNotMatch(server, /pembahasan 8 detik/i);
});

test('final ekonomi menggunakan kotak misteri dan menyembunyikan kesulitan saat voting', () => {
  assert.match(server, /finalDifficultyBoxes = shuffle\(FINAL_DIFFICULTIES\)/);
  assert.match(server, /\['voting', 'voting_ready'\]\.includes\(room\.phase\) \? null : box\.difficulty/);
  assert.match(server, /room\.phase === 'voting' \? null : \(room\.votes\[p\.id\] \|\| null\)/);
  assert.match(server, /const box = room\.finalDifficultyBoxes\.find\(\(item\) => item\.id === String\(data\.boxId \|\| ''\)\)/);
  assert.match(app, /VOTING KOTAK MISTERI/);
  assert.match(app, /data-box-id=/);
  assert.match(app, /HASIL KOTAK MISTERI FINAL/);
});

test('header memiliki kontrol fullscreen dan tampilan warna untuk soal serta kotak final', () => {
  assert.match(html, /id="fullscreen-toggle"/);
  assert.match(app, /document\.documentElement\.requestFullscreen/);
  assert.match(app, /document\.exitFullscreen\(\)/);
  assert.match(css, /\.final-mystery-box:nth-child\(1\)/);
  assert.match(css, /\.answer-option\.correct-answer/);
  assert.match(css, /\.question-text \{/);
});

test('soal berikutnya dan soal siap hanya dikirim ke host sebelum timer dimulai', () => {
  assert.match(server, /const questionHiddenUntilHostStarts = !hostViewer && \['question_ready', 'tiebreak_ready'\]\.includes\(room\.phase\)/);
  assert.match(server, /const visibleQuestion = questionHiddenUntilHostStarts \? null : safeQuestionForClient\(activeQuestion, revealAnswer \|\| hostViewer\)/);
  assert.match(server, /nextQuestionPreview: hostViewer && room\.phase === 'review'/);
  assert.match(app, /if \(!q && !isHost\)/);
  assert.match(app, /Soal berikutnya dirahasiakan/);
  assert.match(app, /isHost && state\.nextQuestionPreview/);
});

test('soal dan pilihan memakai blok warna solid yang jelas, bukan gradien', () => {
  assert.match(css, /\.question-card \{\s*background: #1b3479 !important;\s*background-image: none !important;/);
  assert.match(css, /\.question-card \.question-text \{[\s\S]*?background: #ffcf56 !important;[\s\S]*?background-image: none !important;/);
  assert.match(css, /\.question-card \.answer-option:nth-child\(1\) \{ background: #2864dc !important;/);
  assert.match(css, /\.question-card \.answer-option:nth-child\(2\) \{ background: #008f7a !important;/);
  assert.match(css, /\.question-card \.answer-option:nth-child\(3\) \{ background: #c45a12 !important;/);
  assert.match(css, /\.final-mystery-box:nth-child\(1\) \{ background: #3155d9 !important;/);
});

test('dashboard host, status jawaban, nama peserta, dan skor menggunakan font yang lebih terbaca', () => {
  assert.match(css, /\.participant-mini \.mini-name \{ font-size: 15px;/);
  assert.match(css, /\.mini-score \{ font-size: 19px;/);
  assert.match(css, /\.host-answer-row strong \{ display: block; font-size: 15px;/);
  assert.match(css, /\.answer-status \{ display: inline-flex;[\s\S]*?font-size: 12px;/);
  assert.match(css, /\.score-chip strong \{ font-size: 14px;/);
  assert.match(css, /\.result-value strong \{ font-size: 23px;/);
});
