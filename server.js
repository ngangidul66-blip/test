'use strict';

const path = require('path');
const crypto = require('crypto');
const { getLocalQuestionPack, LOCAL_QUESTION_BANK } = require('./services/local-question-bank');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ECONOMY_FINAL_QUESTIONS } = require('./data/questions');

const PORT = Number(process.env.PORT || 3000);
const REVIEW_SECONDS = 5;
const QUESTION_SECONDS_BY_DIFFICULTY = { easy: 20, medium: 30, hard: 40 };
function questionDurationSeconds(room) {
  const difficulty = room.roundIndex === 4 ? room.finalDifficulty : room.selection?.difficulty;
  return QUESTION_SECONDS_BY_DIFFICULTY[difficulty] || 30;
}
const DEFAULT_VOTING_SECONDS = 30;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DIFFICULTIES = [
  { id: 'easy', label: 'Mudah', points: 10 },
  { id: 'medium', label: 'Sedang', points: 20 },
  { id: 'hard', label: 'Sulit', points: 30 },
];
const FINAL_DIFFICULTIES = DIFFICULTIES;
const LEVELS = [
  { id: 'sd', label: 'SD' },
  { id: 'smp', label: 'SMP' },
  { id: 'sma', label: 'SMA/SMK' },
  { id: 'college', label: 'Perguruan Tinggi' },
];
const SUBJECTS = [
  'Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA', 'IPS', 'Sejarah',
  'Geografi', 'PPKn', 'Ekonomi', 'Pendidikan Agama Islam', 'Pengetahuan Umum',
];
const PUNISHMENT_OPTIONS = [
  'Konser dadakan — nyanyikan lagu selama 20 detik',
  'Joget kemenangan — joget selama 15 detik',
  'Tirukan hewan — tirukan suara dan gerakannya selama 15 detik',
  'Ekspresi teraneh — tahan ekspresi paling lucu selama 10 detik',
  'Next jadi Host — menjadi host pada sesi berikutnya',
  'Roll depan — hanya jika mampu dan dilakukan di tempat aman',
  'Push-up 20x — lakukan sesuai kemampuan',
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000,
});
const rooms = new Map();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'cerdas-cermat-online' }));
app.get('/api/question-bank-status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ mode: 'local-bank-only', entries: LOCAL_QUESTION_BANK.length, combinations: 132, questionsPerRound: 10, apiRequired: false });
});
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function randomHex(bytes = 12) { return crypto.randomBytes(bytes).toString('hex'); }
function createRoomCode() {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => ROOM_CODE_CHARS[crypto.randomInt(0, ROOM_CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function cleanName(value) {
  const name = String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().replace(/\s+/g, ' ');
  return (name || 'Pemain').slice(0, 18);
}
function asBool(value) { return value === true || value === 'true' || value === 'on'; }
function difficultyLabel(id) { return DIFFICULTIES.find((x) => x.id === id)?.label || id || '—'; }
function levelLabel(id) { return LEVELS.find((x) => x.id === id)?.label || id || '—'; }
function pointsFor(room) {
  const id = room.roundIndex === 4 ? room.finalDifficulty : room.selection.difficulty;
  return DIFFICULTIES.find((x) => x.id === id)?.points || 10;
}
function actorName(room, actorId) { return room.players.find((p) => p.id === actorId)?.name || 'Sistem'; }
function audit(room, actorId, action, detail = '') {
  room.logs.push({
    at: Date.now(), actor: actorName(room, actorId), action: String(action),
    detail: String(detail || '').slice(0, 240),
    round: room.roundIndex === 4 ? 'Final' : room.roundIndex + 1,
    question: Number.isInteger(room.questionIndex) ? room.questionIndex + 1 : null,
  });
  if (room.logs.length > 200) room.logs.splice(0, room.logs.length - 200);
}
function notify(socket, message, kind = 'info') {
  socket.emit('notice', { message: String(message), kind });
}
function notifyRoom(room, message, kind = 'info') {
  for (const player of room.players) {
    if (player.socketId) io.to(player.socketId).emit('notice', { message: String(message), kind });
  }
}
function playerFromSocket(socket) {
  const roomCode = socket.data.roomCode;
  const room = rooms.get(roomCode);
  if (!room) return { room: null, player: null };
  const player = room.players.find((p) => p.id === socket.data.playerId && p.socketId === socket.id);
  return { room, player: player || null };
}
function participants(room) { return room.players.filter((p) => p.role === 'participant'); }
function onlinePlayers(room) { return room.players.filter((p) => p.connected); }
function makePlayer({ name, role }) {
  return {
    id: randomHex(8), token: randomHex(24), name: cleanName(name), role,
    socketId: null, connected: false, ready: false, rulesAccepted: false,
    score: 0, correctCount: 0, totalAnswerMs: 0, skippedPunishment: false,
  };
}
function connectPlayer(socket, room, player) {
  const oldSocketId = player.socketId;
  player.socketId = socket.id;
  player.connected = true;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
  if (oldSocketId && oldSocketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(oldSocketId);
    if (oldSocket) oldSocket.disconnect(true);
  }
  socket.emit('joined', {
    roomCode: room.code, token: player.token, playerId: player.id,
    role: player.role, name: player.name,
  });
}
function createRoomObject(code, host, settings) {
  return {
    code, players: [host], status: 'lobby', phase: 'lobby',
    settings: {
      votingSeconds: Math.max(15, Math.min(90, Number(settings?.votingSeconds) || DEFAULT_VOTING_SECONDS)),
      penalties: Array.isArray(settings?.penalties)
        ? settings.penalties.filter((p) => PUNISHMENT_OPTIONS.includes(p)).slice(0, 7)
        : PUNISHMENT_OPTIONS.slice(),
      randomPunishments: asBool(settings?.randomPunishments),
    },
    roundIndex: 0, selectionStageIndex: 0,
    selection: { difficulty: null, education: null, subject: null },
    selectionChooserId: null, boxes: [], selectedBoxes: [],
    questions: [], questionSetMeta: null, questionLoadError: null, questionIndex: 0,
    questionAnswers: {}, questionResults: {}, endRoundAfterReview: false,
    currentQuestionStartedAt: null, questionDeadlineAt: null, remainingMs: 30 * 1000,
    timerPaused: false, timerKind: null, timerHandle: null, reviewGateHandle: null,
    reviewReadyAt: null, votes: {}, voteBoxChoices: {}, finalDifficultyBoxes: [], voteDeadlineAt: null, voteTieOptions: [], finalDifficulty: null,
    usedQuestionIds: new Set(), usedQuestionConceptKeys: new Set(), logs: [], selectionHistory: [],
    tieOrder: {}, tieGroup: [], tieQuestion: null, tieAnswers: {}, tieReviewReadyAt: null,
    rankings: [], punishmentsByPlayer: {}, punishmentSpin: null, punishmentSpinHandle: null,
    createdAt: Date.now(), lastActivityAt: Date.now(),
  };
}

function stageName(index) { return ['difficulty', 'education', 'subject'][index] || 'subject'; }
function stageOptions(stage) {
  if (stage === 'difficulty') return DIFFICULTIES;
  if (stage === 'education') return LEVELS;
  return SUBJECTS.map((s) => ({ id: s, label: s }));
}
function buildBoxes(room) {
  const stage = stageName(room.selectionStageIndex);
  const options = shuffle(stageOptions(stage));
  room.boxes = options.map((option, i) => ({
    id: `${room.code}-${room.roundIndex + 1}-${room.selectionStageIndex + 1}-${randomHex(4)}`,
    label: `Kotak ${i + 1}`, stage, value: option.id, valueLabel: option.label,
    revealed: false, selected: false,
  }));
  const ps = participants(room);
  room.selectionChooserId = ps.length ? ps[(room.roundIndex + room.selectionStageIndex) % ps.length].id : null;
}
function beginSelectionRound(room) {
  room.status = 'playing';
  room.phase = 'selection';
  room.selectionStageIndex = 0;
  room.selection = { difficulty: null, education: null, subject: null };
  room.selectedBoxes = [];
  room.questions = [];
  room.questionSetMeta = null;
  room.questionLoadError = null;
  room.questionIndex = 0;
  room.questionAnswers = {};
  room.questionResults = {};
  room.endRoundAfterReview = false;
  room.reviewReadyAt = null;
  room.finalDifficulty = null;
  buildBoxes(room);
  audit(room, null, 'Mulai pemilihan kotak', `Ronde ${room.roundIndex + 1}`);
}
function selectBox(room, actor, boxId, hostOverride = false) {
  if (room.phase !== 'selection') return { ok: false, message: 'Pemilihan kotak sedang tidak aktif.' };
  const box = room.boxes.find((b) => b.id === boxId);
  if (!box || box.selected) return { ok: false, message: 'Kotak ini sudah dibuka atau tidak tersedia.' };
  if (!hostOverride && (!actor || actor.role !== 'participant' || actor.id !== room.selectionChooserId)) {
    return { ok: false, message: 'Saat ini giliran peserta lain untuk memilih kotak.' };
  }
  // Seluruh kombinasi yang tersedia dilayani langsung oleh bank soal lokal.
  box.selected = true;
  box.revealed = true;
  const stage = stageName(room.selectionStageIndex);
  room.selection[stage] = box.value;
  const chooser = participants(room).find((p) => p.id === room.selectionChooserId);
  room.selectedBoxes.push({ stage, boxId: box.id, label: box.label, value: box.value, valueLabel: box.valueLabel, chooserId: chooser?.id || null, chooserName: chooser?.name || 'Peserta' });
  room.selectionHistory.push({ at: Date.now(), round: room.roundIndex + 1, stage, boxLabel: box.label, value: box.valueLabel, chooser: chooser?.name || 'Peserta', actor: actor?.name || 'Host' });
  audit(room, actor?.id || null, 'Membuka kotak', `${stage}: ${box.label} → ${box.valueLabel}${hostOverride ? ' (kontrol host)' : ''}`);
  room.selectionStageIndex += 1;
  if (room.selectionStageIndex < 3) {
    buildBoxes(room);
  } else {
    prepareMainQuestions(room);
  }
  return { ok: true };
}

function normalizedDifficulty(id) { return id || 'medium'; }
function applyQuestionPack(room, requested, pack) {
  const questions = pack.questions;
  room.questions = shuffle(questions.map((question) => ({ ...question, options: [...question.options] })));
  room.questionSetMeta = {
    ...(pack.meta || {}),
    sourceMode: 'local-bank',
    selectedCombination: { subject: requested.subject, education: requested.level, difficulty: room.selection.difficulty },
    total: questions.length,
    exactCount: questions.length,
  };
  room.questionLoadError = null;
  room.phase = 'question_ready';
  room.questionIndex = 0;
  room.questionAnswers = {};
  room.questionResults = {};
  room.currentQuestionStartedAt = null;
  room.questionDeadlineAt = null;
  room.remainingMs = questionDurationSeconds(room) * 1000;
  room.timerPaused = false;
  audit(room, null, 'Paket bank soal siap', `${questions.length} soal dari bank lokal untuk ${requested.subject}/${requested.level}/${requested.difficulty}`);
  notifyRoom(room, '10 soal dipilih dari bank lokal sesuai mata pelajaran, jenjang, dan tingkat kesulitan. Tidak membutuhkan API, pencarian internet, atau billing. Host dapat meninjau dan mengoreksi soal sebelum memulai.', 'success');
  pushRoom(room);
}
function prepareMainQuestions(room) {
  const requested = {
    subject: room.selection.subject,
    level: room.selection.education,
    difficulty: normalizedDifficulty(room.selection.difficulty || 'medium'),
  };
  room.questionLoadError = null;
  room.questions = [];
  room.questionIndex = 0;
  room.questionAnswers = {};
  room.questionResults = {};
  room.questionSetMeta = {
    sourceMode: 'local-bank', total: 10,
    selectedCombination: { subject: requested.subject, education: requested.level, difficulty: room.selection.difficulty },
  };
  // Bank selection is synchronous: no remote question generation or waiting phase is needed.
  room.currentQuestionStartedAt = null;
  room.questionDeadlineAt = null;
  room.remainingMs = questionDurationSeconds(room) * 1000;
  room.timerPaused = false;
  audit(room, null, 'Memilih soal dari bank lokal', `${requested.subject}, ${levelLabel(requested.level)}, ${difficultyLabel(requested.difficulty)}`);
  try {
    const questions = getLocalQuestionPack({
      ...requested,
      count: 10,
      excludeIds: room.usedQuestionIds,
      excludeConceptKeys: room.usedQuestionConceptKeys,
    });
    applyQuestionPack(room, requested, {
      questions,
      meta: {
        sourceMode: 'local-bank',
        total: questions.length,
        generatedAt: new Date().toISOString(),
        sources: [...new Set(questions.flatMap((q) => (q.sourceRefs || []).map((ref) => ref.url)))],
      },
    });
    return { ok: true };
  } catch (error) {
    room.phase = 'question_error';
    room.questionLoadError = `Bank soal tidak dapat dimuat: ${error.message}`;
    audit(room, null, 'Bank soal gagal dimuat', error.message);
    pushRoom(room);
    notifyRoom(room, room.questionLoadError, 'error');
    return { ok: false, message: room.questionLoadError };
  }
}

function replaceMainSubject(room, subject) {
  if (room.roundIndex > 3 || !['question_ready', 'question_error'].includes(room.phase)) return { ok: false, message: 'Mapel hanya dapat diganti sebelum soal pertama dimulai.' };
  if (!SUBJECTS.includes(subject)) return { ok: false, message: 'Mapel pengganti tidak tersedia.' };
  room.selection.subject = subject;
  return prepareMainQuestions(room);
}

function questionForDifficulty(difficulty) {
  const pool = ECONOMY_FINAL_QUESTIONS.filter((q) => q.difficulty === difficulty);
  return shuffle(pool).slice(0, 10).map((q) => JSON.parse(JSON.stringify(q)));
}
function beginFinalQuestions(room, difficulty) {
  room.finalDifficulty = difficulty;
  room.selection = { difficulty, education: 'college', subject: 'Ilmu Ekonomi' };
  room.questions = questionForDifficulty(difficulty);
  room.questionSetMeta = { exactCount: room.questions.length, subjectLevelCount: room.questions.length, subjectCount: room.questions.length, total: room.questions.length, subjectCounts: { 'Ilmu Ekonomi': room.questions.length }, selectedCombination: { subject: 'Ilmu Ekonomi', education: 'college', difficulty } };
  room.questionIndex = 0;
  room.questionAnswers = {};
  room.questionResults = {};
  room.phase = 'question_ready';
  room.currentQuestionStartedAt = null;
  room.questionDeadlineAt = null;
  room.remainingMs = questionDurationSeconds(room) * 1000;
  room.timerPaused = false;
  audit(room, null, 'Paket final disiapkan', `10 soal Ilmu Ekonomi — ${difficultyLabel(difficulty)}`);
}
function currentQuestion(room) {
  return room.questions[room.questionIndex] || null;
}
function clearTimer(room) {
  if (room.timerHandle) clearTimeout(room.timerHandle);
  room.timerHandle = null;
  room.timerKind = null;
}
function setCountdown(room, kind, milliseconds) {
  clearTimer(room);
  room.timerKind = kind;
  room.timerHandle = setTimeout(() => {
    room.timerHandle = null;
    if (kind === 'question' && room.phase === 'question_active' && !room.timerPaused) closeQuestion(room, 'Waktu habis');
    else if (kind === 'voting' && room.phase === 'voting') finishVoting(room, 'Waktu voting habis');
    else if (kind === 'tiebreak' && room.phase === 'tiebreak_active' && !room.timerPaused) closeTieQuestion(room, 'Waktu tie-break habis');
  }, Math.max(0, milliseconds));
}
function startQuestionTimer(room) {
  const now = Date.now();
  room.phase = 'question_active';
  room.currentQuestionStartedAt = now;
  const durationMs = questionDurationSeconds(room) * 1000;
  room.questionDeadlineAt = now + durationMs;
  room.remainingMs = durationMs;
  room.timerPaused = false;
  room.questionAnswers = {};
  room.questionResults = {};
  const q = currentQuestion(room);
  if (q) {
    room.usedQuestionIds.add(q.id);
    if (q.conceptKey) room.usedQuestionConceptKeys.add(q.conceptKey);
  }
  audit(room, null, 'Soal diaktifkan', `Soal ${room.questionIndex + 1}/${room.questions.length}`);
  setCountdown(room, 'question', durationMs);
}
function startTieTimer(room) {
  room.phase = 'tiebreak_active';
  const durationMs = questionDurationSeconds(room) * 1000;
  room.currentQuestionStartedAt = Date.now();
  room.questionDeadlineAt = Date.now() + durationMs;
  room.remainingMs = durationMs;
  room.timerPaused = false;
  room.tieAnswers = {};
  setCountdown(room, 'tiebreak', durationMs);
  audit(room, null, 'Soal tie-break diaktifkan', `${room.tieGroup.length} peserta terlibat`);
}
function answerAllReceived(room) {
  const active = participants(room);
  return active.length > 0 && active.every((p) => room.questionAnswers[p.id]);
}
function closeQuestion(room, reason) {
  if (room.phase !== 'question_active') return;
  clearTimer(room);
  room.timerPaused = false;
  room.questionDeadlineAt = null;
  room.remainingMs = 0;
  const q = currentQuestion(room);
  const points = pointsFor(room);
  room.questionResults = {};
  for (const player of participants(room)) {
    const answer = room.questionAnswers[player.id];
    const correct = Boolean(answer && answer.choice === q?.answer);
    const earned = correct ? points : 0;
    if (answer) player.totalAnswerMs += answer.elapsedMs;
    if (correct) {
      player.score += earned;
      player.correctCount += 1;
    }
    room.questionResults[player.id] = {
      choice: answer ? answer.choice : null,
      choiceLabel: answer ? String.fromCharCode(65 + answer.choice) : null,
      correct, pointsEarned: earned,
      elapsedMs: answer ? answer.elapsedMs : null,
      submittedAt: answer ? answer.submittedAt : null,
      status: answer ? (correct ? 'Benar' : 'Salah') : 'Tidak menjawab',
    };
  }
  room.phase = 'review';
  room.reviewReadyAt = Date.now() + REVIEW_SECONDS * 1000;
  audit(room, null, 'Soal ditutup', `${reason}; kunci jawaban ditampilkan`);
  if (room.reviewGateHandle) clearTimeout(room.reviewGateHandle);
  room.reviewGateHandle = setTimeout(() => {
    room.reviewGateHandle = null;
    if (room.phase === 'review') pushRoom(room);
  }, REVIEW_SECONDS * 1000 + 30);
  pushRoom(room);
}
function closeTieQuestion(room, reason) {
  if (room.phase !== 'tiebreak_active') return;
  clearTimer(room);
  room.timerPaused = false;
  room.questionDeadlineAt = null;
  room.remainingMs = 0;
  room.phase = 'tiebreak_review';
  room.tieReviewReadyAt = Date.now() + REVIEW_SECONDS * 1000;
  audit(room, null, 'Soal tie-break ditutup', reason);
  if (room.reviewGateHandle) clearTimeout(room.reviewGateHandle);
  room.reviewGateHandle = setTimeout(() => {
    room.reviewGateHandle = null;
    if (room.phase === 'tiebreak_review') pushRoom(room);
  }, REVIEW_SECONDS * 1000 + 30);
  pushRoom(room);
}
function finishRound(room) {
  clearTimer(room);
  room.phase = 'round_score';
  room.questionDeadlineAt = null;
  room.timerPaused = false;
  audit(room, null, 'Ronde selesai', `Ronde utama ${room.roundIndex + 1}`);
}
function sortParticipants(room) {
  return participants(room).slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    if (a.totalAnswerMs !== b.totalAnswerMs) return a.totalAnswerMs - b.totalAnswerMs;
    const ao = room.tieOrder[a.id];
    const bo = room.tieOrder[b.id];
    if (Number.isFinite(ao) && Number.isFinite(bo)) return ao - bo;
    if (Number.isFinite(ao)) return -1;
    if (Number.isFinite(bo)) return 1;
    return a.id.localeCompare(b.id);
  });
}
function sameBaseRank(a, b) {
  return a.score === b.score && a.correctCount === b.correctCount && a.totalAnswerMs === b.totalAnswerMs;
}
function nextTiebreakGroup(room) {
  const sorted = sortParticipants(room);
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sameBaseRank(sorted[i], sorted[j])) j += 1;
    if (j - i > 1 && !sorted.slice(i, j).every((p) => Number.isFinite(room.tieOrder[p.id]))) return sorted.slice(i, j);
    i = j;
  }
  return null;
}
function assignPunishments(room) {
  const ranked = sortParticipants(room);
  room.punishmentsByPlayer = {};
  room.punishmentSpin = null;
  if (room.punishmentSpinHandle) clearTimeout(room.punishmentSpinHandle);
  room.punishmentSpinHandle = null;
  if (ranked[1]) room.punishmentsByPlayer[ranked[1].id] = { place: 2, text: null, index: null, spun: false, skipped: false };
  if (ranked[2]) room.punishmentsByPlayer[ranked[2].id] = { place: 3, text: null, index: null, spun: false, skipped: false };
  if (ranked[1]) audit(room, null, 'Roulette juara 2 siap', `${ranked[1].name} menunggu putaran host`);
  if (ranked[2]) audit(room, null, 'Roulette juara 3 siap', `${ranked[2].name} menunggu putaran host`);
}

function finishGame(room) {
  clearTimer(room);
  room.phase = 'results';
  room.rankings = sortParticipants(room).map((p, i) => ({ playerId: p.id, name: p.name, place: i + 1, score: p.score, correctCount: p.correctCount, totalAnswerMs: p.totalAnswerMs }));
  assignPunishments(room);
  audit(room, null, 'Permainan selesai', `Juara pertama: ${room.rankings[0]?.name || '—'}`);
}
function setupTiebreakOrResults(room) {
  const group = nextTiebreakGroup(room);
  if (!group) {
    finishGame(room);
    return;
  }
  room.tieGroup = group.map((p) => p.id);
  const unused = ECONOMY_FINAL_QUESTIONS.filter((q) => !room.questions.some((used) => used.id === q.id));
  room.tieQuestion = JSON.parse(JSON.stringify(shuffle(unused.length ? unused : ECONOMY_FINAL_QUESTIONS)[0]));
  room.tieAnswers = {};
  room.tieReviewReadyAt = null;
  room.phase = 'tiebreak_ready';
  audit(room, null, 'Tie-break diperlukan', group.map((p) => p.name).join(', '));
}
function resolveTiebreak(room) {
  if (room.phase !== 'tiebreak_review') return { ok: false, message: 'Pembahasan tie-break belum aktif.' };
  if (Date.now() < (room.tieReviewReadyAt || 0)) return { ok: false, message: 'Pembahasan harus tampil setidaknya 5 detik.' };
  const group = room.tieGroup.map((id) => room.players.find((p) => p.id === id)).filter(Boolean);
  group.sort((a, b) => {
    const aa = room.tieAnswers[a.id];
    const bb = room.tieAnswers[b.id];
    const ac = Boolean(aa && aa.choice === room.tieQuestion.answer);
    const bc = Boolean(bb && bb.choice === room.tieQuestion.answer);
    if (ac !== bc) return ac ? -1 : 1;
    const at = aa ? aa.elapsedMs : Number.POSITIVE_INFINITY;
    const bt = bb ? bb.elapsedMs : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    const as = aa ? aa.submittedAt : Number.POSITIVE_INFINITY;
    const bs = bb ? bb.submittedAt : Number.POSITIVE_INFINITY;
    if (as !== bs) return as - bs;
    return a.id.localeCompare(b.id);
  });
  group.forEach((player, index) => { room.tieOrder[player.id] = index; });
  audit(room, null, 'Tie-break selesai', `Urutan: ${group.map((p) => p.name).join(' → ')}`);
  room.tieGroup = [];
  room.tieQuestion = null;
  room.tieAnswers = {};
  setupTiebreakOrResults(room);
  return { ok: true };
}
function startVoting(room) {
  room.phase = 'voting';
  room.votes = {};
  room.voteBoxChoices = {};
  room.voteDeadlineAt = Date.now() + room.settings.votingSeconds * 1000;
  room.voteTieOptions = [];
  if (!room.finalDifficultyBoxes.length) room.finalDifficultyBoxes = shuffle(FINAL_DIFFICULTIES).map((d, i) => ({ id: `final-box-${i + 1}`, label: `Kotak Misteri ${i + 1}`, difficulty: d.id }));
  setCountdown(room, 'voting', room.settings.votingSeconds * 1000);
  audit(room, null, 'Voting final dimulai', `Durasi ${room.settings.votingSeconds} detik`);
}
function finishVoting(room, reason) {
  if (room.phase !== 'voting') return;
  clearTimer(room);
  room.voteDeadlineAt = null;
  const tally = Object.fromEntries(FINAL_DIFFICULTIES.map((d) => [d.id, 0]));
  for (const player of participants(room)) if (room.votes[player.id] && Object.hasOwn(tally, room.votes[player.id])) tally[room.votes[player.id]] += 1;
  const max = Math.max(0, ...Object.values(tally));
  const leaders = FINAL_DIFFICULTIES.filter((d) => tally[d.id] === max).map((d) => d.id);
  audit(room, null, 'Voting final ditutup', `${reason}; ${Object.values(room.votes).filter(Boolean).length}/${participants(room).length} suara masuk`);
  if (leaders.length === 1 && max > 0) {
    beginFinalQuestions(room, leaders[0]);
  } else {
    room.voteTieOptions = leaders.length ? leaders : FINAL_DIFFICULTIES.map((d) => d.id);
    room.phase = 'voting_tiebreak';
    notifyRoom(room, 'Voting seri atau tidak ada suara. Host akan menentukan tingkat kesulitan final.', 'warning');
  }
  // Voting dapat berakhir dari timer server atau suara terakhir, bukan hanya kontrol host.
  // Selalu broadcast perubahan fase agar semua klien berpindah serentak.
  pushRoom(room);
}
function startNextRound(room) {
  room.endRoundAfterReview = false;
  if (room.roundIndex < 3) {
    room.roundIndex += 1;
    beginSelectionRound(room);
  } else {
    room.roundIndex = 4;
    room.phase = 'voting_ready';
    room.status = 'playing';
    room.selection = { difficulty: null, education: 'college', subject: 'Ilmu Ekonomi' };
    room.finalDifficultyBoxes = shuffle(FINAL_DIFFICULTIES).map((d, i) => ({ id: `final-box-${i + 1}`, label: `Kotak Misteri ${i + 1}`, difficulty: d.id }));
    room.votes = {};
    room.voteBoxChoices = {};
    room.voteTieOptions = [];
    room.finalDifficulty = null;
    audit(room, null, 'Empat ronde utama selesai', 'Memasuki ronde final Ilmu Ekonomi');
  }
}
function resetForNewSession(room) {
  clearTimer(room);
  if (room.punishmentSpinHandle) clearTimeout(room.punishmentSpinHandle);
  room.punishmentSpinHandle = null; room.punishmentSpin = null;
  if (room.reviewGateHandle) clearTimeout(room.reviewGateHandle);
  room.reviewGateHandle = null;
  room.status = 'lobby'; room.phase = 'lobby'; room.roundIndex = 0;
  room.selectionStageIndex = 0; room.selection = { difficulty: null, education: null, subject: null };
  room.selectionChooserId = null; room.boxes = []; room.selectedBoxes = [];
  room.questions = []; room.questionSetMeta = null; room.questionIndex = 0;
  room.questionAnswers = {}; room.questionResults = {}; room.endRoundAfterReview = false; room.currentQuestionStartedAt = null;
  room.questionDeadlineAt = null; room.remainingMs = 30 * 1000; room.timerPaused = false;
  room.reviewReadyAt = null; room.votes = {}; room.voteBoxChoices = {}; room.finalDifficultyBoxes = []; room.voteDeadlineAt = null; room.voteTieOptions = [];
  room.finalDifficulty = null; room.usedQuestionIds = new Set(); room.usedQuestionConceptKeys = new Set(); room.selectionHistory = [];
  room.tieOrder = {}; room.tieGroup = []; room.tieQuestion = null; room.tieAnswers = {}; room.tieReviewReadyAt = null;
  room.rankings = []; room.punishmentsByPlayer = {};
  for (const p of room.players) { p.ready = false; p.rulesAccepted = false; p.score = 0; p.correctCount = 0; p.totalAnswerMs = 0; p.skippedPunishment = false; }
  audit(room, null, 'Sesi diatur ulang', 'Kembali ke lobby');
}

function safeQuestionForClient(question, reveal) {
  if (!question) return null;
  const result = {
    id: question.id, subject: question.subject, level: question.level,
    difficulty: question.difficulty, question: question.question,
    options: question.options.slice(),
  };
  if (reveal) {
    result.sourceRefs = Array.isArray(question.sourceRefs) ? question.sourceRefs : [];
    result.sourceNote = question.sourceNote || 'Rujukan materi untuk membantu memeriksa konsep dan kunci jawaban.';
  }
  if (reveal) {
    result.answer = question.answer;
    result.answerLabel = String.fromCharCode(65 + question.answer);
    result.explanation = question.explanation;
  }
  return result;
}
function makeState(room, viewer) {
  const hostViewer = viewer.role === 'host';
  const revealAnswer = ['review', 'round_score', 'results', 'tiebreak_review'].includes(room.phase);
  const isTiePhase = room.phase.startsWith('tiebreak_');
  const activeQuestion = isTiePhase ? room.tieQuestion : currentQuestion(room);
  // Soal siap dan soal tie-break yang belum dimulai hanya boleh terlihat oleh host.
  // Peserta baru menerima teks pertanyaan dan opsi setelah timer benar-benar aktif.
  const questionHiddenUntilHostStarts = !hostViewer && ['question_ready', 'tiebreak_ready'].includes(room.phase);
  // Host boleh mengaudit/mengoreksi kunci secara privat; peserta hanya menerima soal aktif dan kunci setelah soal ditutup.
  const visibleQuestion = questionHiddenUntilHostStarts ? null : safeQuestionForClient(activeQuestion, revealAnswer || hostViewer);
  if (visibleQuestion && isTiePhase) {
    visibleQuestion.subject = 'Tie-break';
    visibleQuestion.level = 'Perguruan Tinggi';
    visibleQuestion.difficulty = 'tie-break';
  }
  const sorted = sortParticipants(room);
  const players = room.players.map((p) => {
    const punishment = room.punishmentsByPlayer[p.id];
    return {
      id: p.id, name: p.name, role: p.role, connected: p.connected,
      ready: p.ready, rulesAccepted: p.rulesAccepted,
      score: p.score, correctCount: p.correctCount,
      totalAnswerMs: p.totalAnswerMs,
      ownVote: viewer.id === p.id ? (room.phase === 'voting' ? null : (room.votes[p.id] || null)) : null,
      hasVoted: Boolean(room.votes[p.id]),
      hasAnswered: Boolean((isTiePhase ? room.tieAnswers[p.id] : room.questionAnswers[p.id])),
      skippedPunishment: p.skippedPunishment,
      punishment: punishment ? { ...punishment, skipped: p.skippedPunishment || punishment.skipped } : null,
    };
  });
  const activeChooser = participants(room).find((p) => p.id === room.selectionChooserId) || null;
  const boxes = room.boxes.map((b) => ({
    id: b.id, label: b.label, stage: b.stage, revealed: b.revealed, selected: b.selected,
    valueLabel: (hostViewer || b.revealed) ? b.valueLabel : null,
  }));
  const state = {
    roomCode: room.code, status: room.status, phase: room.phase,
    role: viewer.role, selfId: viewer.id, selfName: viewer.name,
    settings: { votingSeconds: room.settings.votingSeconds, penalties: room.settings.penalties, randomPunishments: room.settings.randomPunishments },
    players,
    roundIndex: room.roundIndex,
    roundNumber: room.roundIndex === 4 ? 5 : room.roundIndex + 1,
    roundLabel: room.roundIndex === 4 ? 'Ronde Final — Ilmu Ekonomi' : `Ronde ${room.roundIndex + 1}`,
    selectionStage: room.phase === 'selection' ? stageName(room.selectionStageIndex) : null,
    selectionStageIndex: room.selectionStageIndex,
    selection: { ...room.selection, educationLabel: levelLabel(room.selection.education), difficultyLabel: difficultyLabel(room.selection.difficulty) },
    selectionChooser: activeChooser ? { id: activeChooser.id, name: activeChooser.name } : null,
    isMySelectionTurn: viewer.role === 'participant' && viewer.id === room.selectionChooserId && room.phase === 'selection',
    boxes,
    selectedBoxes: room.selectedBoxes.map((b) => ({ ...b })),
    question: visibleQuestion,
    questionNumber: room.questionIndex + 1,
    totalQuestions: room.questions.length,
    questionDeadlineAt: room.questionDeadlineAt,
    questionDurationSeconds: questionDurationSeconds(room),
    currentQuestionStartedAt: room.currentQuestionStartedAt,
    remainingMs: room.remainingMs,
    timerPaused: room.timerPaused,
    reviewReadyAt: room.phase === 'review' ? room.reviewReadyAt : (room.phase === 'tiebreak_review' ? room.tieReviewReadyAt : null),
    endRoundAfterReview: Boolean(room.endRoundAfterReview),
    // Pratinjau soal berikutnya tidak pernah dikirim ke koneksi peserta.
    nextQuestionPreview: hostViewer && room.phase === 'review' && !room.endRoundAfterReview && Date.now() >= (room.reviewReadyAt || Infinity) && room.questionIndex < room.questions.length - 1
      ? safeQuestionForClient(room.questions[room.questionIndex + 1], true) : null,
    pointsForCorrect: room.roundIndex === 4 ? DIFFICULTIES.find((d) => d.id === room.finalDifficulty)?.points : pointsFor(room),
    questionSetMeta: room.questionSetMeta,
    questionLoadError: room.questionLoadError,
    questionAnswers: {}, questionResults: {},
    voting: {
      active: room.phase === 'voting', deadlineAt: room.voteDeadlineAt,
      hasVoted: Boolean(room.votes[viewer.id]), ownVote: room.phase === 'voting' ? null : (room.votes[viewer.id] || null),
      ownVoteBoxId: room.voteBoxChoices[viewer.id] || null,
      boxes: room.finalDifficultyBoxes.map((box) => ({
        id: box.id, label: box.label,
        difficulty: ['voting', 'voting_ready'].includes(room.phase) ? null : box.difficulty,
        difficultyLabel: ['voting', 'voting_ready'].includes(room.phase) ? null : difficultyLabel(box.difficulty),
        points: ['voting', 'voting_ready'].includes(room.phase) ? null : (DIFFICULTIES.find((d) => d.id === box.difficulty)?.points || 0),
      })),
      tieOptions: ['voting_tiebreak', 'question_ready'].includes(room.phase) ? room.voteTieOptions : [],
      finalDifficulty: room.finalDifficulty,
      tally: ['voting_tiebreak', 'question_ready', 'round_score', 'results', 'tiebreak_ready', 'tiebreak_active', 'tiebreak_review'].includes(room.phase)
        ? Object.fromEntries(FINAL_DIFFICULTIES.map((d) => [d.id, participants(room).filter((p) => room.votes[p.id] === d.id).length])) : null,
    },
    tieGroup: room.tieGroup.map((id) => room.players.find((p) => p.id === id)?.name).filter(Boolean),
    tieGroupIds: room.tieGroup.slice(),
    rankings: room.phase === 'results' ? room.rankings : [],
    punishments: room.phase === 'results' ? room.rankings.map((r) => ({ ...r, punishment: room.punishmentsByPlayer[r.playerId] ? { ...room.punishmentsByPlayer[r.playerId], skipped: Boolean(room.players.find((p) => p.id === r.playerId)?.skippedPunishment) || room.punishmentsByPlayer[r.playerId].skipped } : null, skipped: Boolean(room.players.find((p) => p.id === r.playerId)?.skippedPunishment) })) : [],
    rouletteSpin: room.phase === 'results' && room.punishmentSpin ? { playerId: room.punishmentSpin.playerId, place: room.punishmentSpin.place, index: room.punishmentSpin.index, endsAt: room.punishmentSpin.endsAt } : null,
    ownPunishment: room.punishmentsByPlayer[viewer.id] || null,
    ownSkippedPunishment: Boolean(room.players.find((p) => p.id === viewer.id)?.skippedPunishment),
    selectionHistory: hostViewer ? room.selectionHistory.slice(-60) : [],
    serverNow: Date.now(),
  };
  if (room.phase === 'question_active' || room.phase === 'question_ready' || room.phase === 'review' || room.phase === 'round_score' || room.phase === 'results') {
    for (const p of participants(room)) {
      const answer = room.questionAnswers[p.id];
      const result = room.questionResults[p.id];
      if (hostViewer || revealAnswer) {
        state.questionAnswers[p.id] = answer ? {
          name: p.name, choice: answer.choice, choiceLabel: String.fromCharCode(65 + answer.choice),
          elapsedMs: answer.elapsedMs, submittedAt: answer.submittedAt,
          status: result?.status || 'Terkirim', pointsEarned: result?.pointsEarned ?? null,
        } : { name: p.name, choice: null, choiceLabel: null, elapsedMs: null, status: 'Belum menjawab', pointsEarned: result?.pointsEarned ?? null };
      } else if (viewer.id === p.id) {
        state.questionAnswers[p.id] = answer ? { name: p.name, choice: answer.choice, choiceLabel: String.fromCharCode(65 + answer.choice), elapsedMs: answer.elapsedMs, status: 'Jawaban terkirim' } : null;
      }
      if (result && (hostViewer || revealAnswer)) state.questionResults[p.id] = { ...result, name: p.name };
    }
  }
  if (room.phase.startsWith('tiebreak_') && room.tieQuestion) {
    state.tieQuestionNumber = 'Tie-break';
    state.tieAnswers = {};
    for (const id of room.tieGroup) {
      const p = room.players.find((x) => x.id === id);
      const answer = room.tieAnswers[id];
      const row = answer ? { name: p?.name, elapsedMs: answer.elapsedMs, status: revealAnswer ? (answer.choice === room.tieQuestion.answer ? 'Benar' : 'Salah') : 'Terkirim' } : { name: p?.name, status: 'Belum menjawab' };
      if (answer && (hostViewer || revealAnswer || viewer.id === id)) {
        row.choice = answer.choice;
        row.choiceLabel = String.fromCharCode(65 + answer.choice);
      }
      state.tieAnswers[id] = row;
    }
  }
  if (hostViewer) {
    const tally = Object.fromEntries(FINAL_DIFFICULTIES.map((d) => [d.id, 0]));
    for (const id of Object.keys(room.votes)) if (room.votes[id] && Object.hasOwn(tally, room.votes[id])) tally[room.votes[id]] += 1;
    state.hostData = {
      votes: participants(room).map((p) => { const box = room.finalDifficultyBoxes.find((b) => b.id === room.voteBoxChoices[p.id]); return { id: p.id, name: p.name, vote: room.phase === 'voting' ? null : (room.votes[p.id] || null), voteLabel: !room.votes[p.id] ? 'Belum memilih' : room.phase === 'voting' ? 'Kotak terkunci' : `${box?.label || 'Kotak'} · ${difficultyLabel(room.votes[p.id])}`, submitted: Boolean(room.votes[p.id]), connected: p.connected }; }),
      voteTally: room.phase === 'voting' ? null : tally,
      players: participants(room).map((p) => ({ id: p.id, name: p.name, connected: p.connected, ready: p.ready, rulesAccepted: p.rulesAccepted, score: p.score, correctCount: p.correctCount, hasAnswered: Boolean((isTiePhase ? room.tieAnswers[p.id] : room.questionAnswers[p.id])), answer: room.questionAnswers[p.id] ? { choiceLabel: String.fromCharCode(65 + room.questionAnswers[p.id].choice), elapsedMs: room.questionAnswers[p.id].elapsedMs, submittedAt: room.questionAnswers[p.id].submittedAt } : null, result: room.questionResults[p.id] || null })),
      logs: room.logs.slice(-60).reverse(),
      selectionHistory: room.selectionHistory.slice(-60).reverse(),
      boxValues: room.boxes.map((b) => ({ id: b.id, label: b.label, valueLabel: b.valueLabel, revealed: b.revealed, selected: b.selected })),
    };
  }
  return state;
}
function pushRoom(room) {
  room.lastActivityAt = Date.now();
  for (const player of room.players) {
    if (!player.socketId) continue;
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket) socket.emit('state', makeState(room, player));
  }
}
function pauseTimer(room) {
  if (!['question_active', 'tiebreak_active'].includes(room.phase) || room.timerPaused) return { ok: false, message: 'Timer tidak sedang berjalan.' };
  if (room.questionDeadlineAt) room.remainingMs = Math.max(0, room.questionDeadlineAt - Date.now());
  clearTimer(room);
  room.questionDeadlineAt = null;
  room.timerPaused = true;
  audit(room, null, 'Timer dijeda', `${Math.ceil(room.remainingMs / 1000)} detik tersisa`);
  return { ok: true };
}
function resumeTimer(room) {
  if (!['question_active', 'tiebreak_active'].includes(room.phase) || !room.timerPaused) return { ok: false, message: 'Timer tidak sedang dijeda.' };
  room.timerPaused = false;
  room.questionDeadlineAt = Date.now() + room.remainingMs;
  const kind = room.phase === 'tiebreak_active' ? 'tiebreak' : 'question';
  setCountdown(room, kind, room.remainingMs);
  audit(room, null, 'Timer dilanjutkan', `${Math.ceil(room.remainingMs / 1000)} detik tersisa`);
  return { ok: true };
}
function finishReview(room) {
  if (room.phase !== 'review') return { ok: false, message: 'Pembahasan soal tidak sedang aktif.' };
  if (Date.now() < (room.reviewReadyAt || 0)) return { ok: false, message: 'Pembahasan harus tampil setidaknya 5 detik.' };
  if (room.endRoundAfterReview) {
    room.endRoundAfterReview = false;
    finishRound(room);
    return { ok: true };
  }
  if (room.questionIndex < room.questions.length - 1) {
    room.questionIndex += 1;
    startQuestionTimer(room);
    return { ok: true };
  }
  if (room.roundIndex < 4) {
    finishRound(room);
  } else {
    setupTiebreakOrResults(room);
  }
  return { ok: true };
}

function handleHostAction(room, host, action, data = {}) {
  if (host.role !== 'host') return { ok: false, message: 'Hanya host yang dapat memakai kontrol ini.' };
  switch (action) {
    case 'deduct_points': {
      if (room.status !== 'playing' || ['lobby', 'rules', 'results'].includes(room.phase)) {
        return { ok: false, message: 'Pengurangan poin hanya tersedia selama pertandingan berlangsung.' };
      }
      const target = participants(room).find((p) => p.id === String(data.playerId || ''));
      if (!target) return { ok: false, message: 'Peserta yang dipilih tidak ditemukan.' };
      const amount = Number(data.amount);
      if (![5, 10, 20, 30].includes(amount)) {
        return { ok: false, message: 'Pilih pengurangan 5, 10, 20, atau 30 poin.' };
      }
      if (target.score <= 0) return { ok: false, message: `${target.name} sudah memiliki 0 poin; skor tidak bisa dikurangi lagi.` };
      const before = target.score;
      const deducted = Math.min(before, amount);
      target.score = Math.max(0, before - amount);
      audit(room, host.id, 'Mengurangi poin peserta', `${target.name}: -${deducted} poin (${before} → ${target.score})`);
      return { ok: true, message: `Poin ${target.name} dikurangi ${deducted} poin. Skor sekarang ${target.score}.` };
    }
    case 'spin_punishment': {
      if (room.phase !== 'results') return { ok: false, message: 'Roulette hukuman hanya tersedia setelah pertandingan selesai.' };
      if (room.punishmentSpin) return { ok: false, message: 'Tunggu putaran roulette yang sedang berjalan selesai.' };
      const playerId = String(data.playerId || '');
      const rankedTarget = room.rankings.find((r) => r.playerId === playerId && [2, 3].includes(r.place));
      const assignment = room.punishmentsByPlayer[playerId];
      if (!rankedTarget || !assignment) return { ok: false, message: 'Roulette hanya bisa diputar untuk juara 2 atau juara 3.' };
      if (assignment.spun || assignment.text) return { ok: false, message: 'Hukuman peserta tersebut sudah ditentukan.' };
      let list = (room.settings.penalties || []).filter((item) => PUNISHMENT_OPTIONS.includes(item));
      if (!list.length) list = PUNISHMENT_OPTIONS.slice();
      const used = Object.entries(room.punishmentsByPlayer)
        .filter(([id, item]) => id !== playerId && item?.spun && item.text)
        .map(([, item]) => item.text);
      const unused = list.filter((item) => !used.includes(item));
      if (unused.length) list = unused;
      const nextHostChallenge = PUNISHMENT_OPTIONS.find((item) => item.startsWith('Next jadi Host'));
      const nextHostAlreadyAssigned = Object.entries(room.punishmentsByPlayer).some(([id, item]) => id !== playerId && item?.spun && !item.skipped && item.text === nextHostChallenge);
      if (nextHostAlreadyAssigned) {
        const withoutNextHost = list.filter((item) => item !== nextHostChallenge);
        list = withoutNextHost.length ? withoutNextHost : PUNISHMENT_OPTIONS.filter((item) => item !== nextHostChallenge);
      }
      const index = crypto.randomInt(0, list.length);
      const text = list[index];
      const canonicalIndex = PUNISHMENT_OPTIONS.indexOf(text);
      const spinId = crypto.randomBytes(8).toString('hex');
      const endsAt = Date.now() + 3600;
      room.punishmentSpin = { spinId, playerId, place: rankedTarget.place, index: canonicalIndex, text, endsAt };
      audit(room, host.id, 'Memutar roulette hukuman', `${rankedTarget.name} — juara ${rankedTarget.place}`);
      room.punishmentSpinHandle = setTimeout(() => {
        if (room.punishmentSpin?.spinId !== spinId || room.phase !== 'results') return;
        const current = room.punishmentsByPlayer[playerId];
        if (current && !current.spun) {
          room.punishmentsByPlayer[playerId] = { place: rankedTarget.place, text, index: canonicalIndex, spun: true, skipped: false };
          audit(room, host.id, 'Roulette hukuman selesai', `${rankedTarget.name}: ${text}`);
        }
        room.punishmentSpin = null;
        room.punishmentSpinHandle = null;
        pushRoom(room);
      }, 3600);
      return { ok: true, message: `Roulette untuk ${rankedTarget.name} mulai berputar.` };
    }
    case 'update_settings': {
      if (room.phase !== 'lobby') return { ok: false, message: 'Pengaturan hanya dapat diubah di lobby.' };
      const settings = data.settings || {};
      if (Array.isArray(settings.penalties)) room.settings.penalties = settings.penalties.filter((p) => PUNISHMENT_OPTIONS.includes(p)).slice(0, 7);
      if (typeof settings.randomPunishments !== 'undefined') room.settings.randomPunishments = asBool(settings.randomPunishments);
      if (settings.votingSeconds) room.settings.votingSeconds = Math.max(15, Math.min(90, Number(settings.votingSeconds) || DEFAULT_VOTING_SECONDS));
      audit(room, host.id, 'Mengubah pengaturan', 'Pengaturan sesi diperbarui');
      return { ok: true, message: 'Pengaturan disimpan.' };
    }
    case 'begin_rules': {
      if (room.phase !== 'lobby') return { ok: false, message: 'Lobby tidak sedang menunggu permainan.' };
      const ps = participants(room);
      if (ps.length !== 3 || ps.some((p) => !p.connected || !p.ready)) return { ok: false, message: 'Diperlukan tepat 3 peserta yang online dan sudah siap.' };
      room.status = 'rules'; room.phase = 'rules';
      for (const p of room.players) p.rulesAccepted = p.role === 'host';
      audit(room, host.id, 'Membuka tutorial', 'Aturan ditampilkan ke semua pemain');
      return { ok: true };
    }
    case 'start_game': {
      if (room.phase !== 'rules') return { ok: false, message: 'Baca aturan terlebih dahulu.' };
      if (room.players.length !== 4 || room.players.some((p) => !p.connected || !p.rulesAccepted)) return { ok: false, message: 'Semua pemain harus online dan menekan “Saya Mengerti”.' };
      for (const p of room.players) { p.score = 0; p.correctCount = 0; p.totalAnswerMs = 0; p.skippedPunishment = false; }
      room.usedQuestionIds = new Set(); room.usedQuestionConceptKeys = new Set(); room.tieOrder = {}; room.selectionHistory = [];
      room.roundIndex = 0;
      beginSelectionRound(room);
      audit(room, host.id, 'Permainan dimulai', 'Empat ronde utama, lalu final Ilmu Ekonomi');
      return { ok: true };
    }
    case 'open_box': {
      const result = selectBox(room, host, data.boxId, true);
      return result.ok ? { ok: true } : result;
    }
    case 'replace_subject': return replaceMainSubject(room, data.subject);
    case 'reload_question_bank': {
      if (room.roundIndex > 3 || room.phase !== 'question_error') return { ok: false, message: 'Pemuatan ulang bank soal tidak tersedia pada tahap ini.' };
      return prepareMainQuestions(room);
    }
    case 'edit_question': {
      const mode = String(data.mode || 'current');
      let targetIndex;
      if (mode === 'current' && room.phase === 'question_ready') {
        targetIndex = room.questionIndex;
      } else if (mode === 'next' && room.phase === 'review' && Date.now() >= (room.reviewReadyAt || Infinity) && room.questionIndex < room.questions.length - 1 && !room.endRoundAfterReview) {
        targetIndex = room.questionIndex + 1;
      } else {
        return { ok: false, message: 'Soal hanya bisa dikoreksi sebelum diaktifkan atau saat pratinjau soal berikutnya tersedia.' };
      }
      const target = room.questions[targetIndex];
      if (!target) return { ok: false, message: 'Soal yang akan dikoreksi tidak ditemukan.' };
      const question = String(data.question || '').trim().slice(0, 500);
      const explanation = String(data.explanation || '').trim().slice(0, 1200);
      const options = Array.isArray(data.options) ? data.options.map((x) => String(x || '').trim().slice(0, 240)) : [];
      const answer = Number(data.answer);
      if (!question || !explanation || options.length < 2 || options.length > 3 || options.some((x) => !x) || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
        return { ok: false, message: 'Isi pertanyaan, 2–3 opsi, kunci jawaban, dan pembahasan dengan lengkap.' };
      }
      if (new Set(options.map((x) => x.toLocaleLowerCase('id-ID'))).size !== options.length) {
        return { ok: false, message: 'Semua pilihan jawaban harus berbeda.' };
      }
      target.question = question;
      target.options = options;
      target.answer = answer;
      target.explanation = explanation;
      audit(room, host.id, 'Mengoreksi soal', `Soal ${targetIndex + 1}: teks, opsi, kunci, atau pembahasan diperbarui`);
      return { ok: true, message: 'Koreksi soal disimpan.' };
    }
    case 'end_round': {
      if (room.roundIndex > 3) return { ok: false, message: 'Kontrol ini hanya berlaku pada ronde utama.' };
      if (room.phase === 'question_active') {
        room.endRoundAfterReview = true;
        closeQuestion(room, 'Ronde diakhiri oleh host');
        return { ok: true, message: 'Ronde akan selesai setelah pembahasan soal ini.' };
      }
      if (room.phase === 'question_ready') {
        finishRound(room);
        return { ok: true, message: 'Ronde diakhiri oleh host.' };
      }
      if (room.phase === 'review') {
        room.endRoundAfterReview = true;
        if (Date.now() >= (room.reviewReadyAt || 0)) {
          room.endRoundAfterReview = false;
          finishRound(room);
        }
        return { ok: true, message: Date.now() >= (room.reviewReadyAt || 0) ? 'Ronde selesai.' : 'Ronde akan selesai setelah pembahasan 5 detik.' };
      }
      return { ok: false, message: 'Ronde hanya dapat diakhiri ketika soal siap, aktif, atau sedang dibahas.' };
    }
    case 'start_question': {
      if (room.phase === 'question_ready') {
        startQuestionTimer(room);
        return { ok: true };
      }
      if (room.phase === 'tiebreak_ready') {
        startTieTimer(room);
        return { ok: true };
      }
      return { ok: false, message: 'Tidak ada soal siap dimulai.' };
    }
    case 'pause_timer': return pauseTimer(room);
    case 'resume_timer': return resumeTimer(room);
    case 'end_question': {
      if (room.phase === 'question_active') closeQuestion(room, 'Soal diakhiri oleh host');
      else if (room.phase === 'tiebreak_active') closeTieQuestion(room, 'Tie-break diakhiri oleh host');
      else return { ok: false, message: 'Tidak ada soal aktif.' };
      return { ok: true };
    }
    case 'next_question': return finishReview(room);
    case 'next_round': {
      if (room.phase !== 'round_score') return { ok: false, message: 'Ronde belum selesai.' };
      startNextRound(room);
      return { ok: true };
    }
    case 'start_voting': {
      if (room.phase !== 'voting_ready') return { ok: false, message: 'Voting final belum siap.' };
      startVoting(room);
      return { ok: true };
    }
    case 'end_voting': {
      if (room.phase !== 'voting') return { ok: false, message: 'Voting tidak sedang aktif.' };
      finishVoting(room, 'Voting diakhiri host');
      return { ok: true };
    }
    case 'resolve_vote_tie': {
      if (room.phase !== 'voting_tiebreak' || !room.voteTieOptions.includes(data.difficulty)) return { ok: false, message: 'Pilihan pemecah seri tidak valid.' };
      beginFinalQuestions(room, data.difficulty);
      audit(room, host.id, 'Memecahkan seri voting', difficultyLabel(data.difficulty));
      return { ok: true };
    }
    case 'finish_tiebreak': return resolveTiebreak(room);
    case 'restart_session': {
      const nextHostEntry = Object.entries(room.punishmentsByPlayer).find(([playerId, item]) => {
        const player = room.players.find((p) => p.id === playerId);
        return player && item?.spun && !item.skipped && item.text?.startsWith('Next jadi Host');
      });
      resetForNewSession(room);
      if (nextHostEntry) {
        const nextHost = room.players.find((p) => p.id === nextHostEntry[0]);
        const previousHost = room.players.find((p) => p.role === 'host');
        if (nextHost && previousHost && nextHost.id !== previousHost.id) {
          previousHost.role = 'participant';
          nextHost.role = 'host';
          audit(room, host.id, 'Host sesi berikutnya ditetapkan', `${nextHost.name} mengambil alih sebagai host sesuai hasil roulette`);
        }
      }
      audit(room, null, 'Mengatur ulang sesi', 'Progres pertandingan dihapus; kembali ke lobby');
      return { ok: true, message: nextHostEntry ? 'Sesi diatur ulang. Pemenang tantangan Next jadi Host kini memegang kendali.' : 'Sesi diatur ulang. Pemain dapat bersiap kembali.' };
    }
    case 'end_room': {
      clearTimer(room);
      for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('room_closed', { message: 'Host telah menutup room.' });
      rooms.delete(room.code);
      return { ok: true, close: true };
    }
    default: return { ok: false, message: 'Perintah host tidak dikenal.' };
  }
}

io.on('connection', (socket) => {
  socket.on('create_room', (payload = {}) => {
    const name = cleanName(payload.name);
    const code = createRoomCode();
    const host = makePlayer({ name, role: 'host' });
    const room = createRoomObject(code, host, payload.settings || {});
    rooms.set(code, room);
    connectPlayer(socket, room, host);
    audit(room, host.id, 'Room dibuat', `Host ${host.name}`);
    pushRoom(room);
  });

  function joinOrReconnect(payload = {}) {
    const code = String(payload.roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) { notify(socket, 'Room tidak ditemukan. Periksa kembali kode room.', 'error'); return; }
    let player = null;
    if (payload.token) player = room.players.find((p) => p.token === String(payload.token));
    if (player) {
      connectPlayer(socket, room, player);
      audit(room, player.id, 'Menyambung kembali', player.name);
      pushRoom(room);
      notify(socket, 'Koneksi berhasil dipulihkan.', 'success');
      return;
    }
    if (room.status !== 'lobby' || room.phase !== 'lobby') {
      notify(socket, 'Permainan sudah dimulai. Hanya pemain lama yang dapat menyambung kembali menggunakan token sesi.', 'error');
      return;
    }
    if (room.players.length >= 4) { notify(socket, 'Room sudah berisi 1 host dan 3 peserta.', 'error'); return; }
    player = makePlayer({ name: cleanName(payload.name), role: 'participant' });
    room.players.push(player);
    connectPlayer(socket, room, player);
    audit(room, player.id, 'Bergabung ke room', player.name);
    pushRoom(room);
    notifyRoom(room, `${player.name} bergabung ke room.`, 'info');
  }
  socket.on('join_room', joinOrReconnect);
  socket.on('rejoin', joinOrReconnect);

  socket.on('toggle_ready', () => {
    const { room, player } = playerFromSocket(socket);
    if (!room || !player || player.role !== 'participant' || room.phase !== 'lobby') return;
    player.ready = !player.ready;
    audit(room, player.id, player.ready ? 'Siap bermain' : 'Membatalkan kesiapan', player.name);
    pushRoom(room);
  });

  socket.on('ack_rules', () => {
    const { room, player } = playerFromSocket(socket);
    if (!room || !player || room.phase !== 'rules') return;
    player.rulesAccepted = true;
    audit(room, player.id, 'Menyetujui aturan', player.name);
    pushRoom(room);
  });

  socket.on('select_box', (data = {}) => {
    const { room, player } = playerFromSocket(socket);
    if (!room || !player) return;
    const result = selectBox(room, player, String(data.boxId || ''), false);
    if (!result.ok) notify(socket, result.message, 'warning');
    else pushRoom(room);
  });

  socket.on('submit_answer', (data = {}) => {
    const { room, player } = playerFromSocket(socket);
    if (!room || !player || player.role !== 'participant') return;
    const choice = Number(data.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) { notify(socket, 'Pilihan jawaban tidak valid.', 'error'); return; }
    if (room.phase === 'tiebreak_active') {
      if (!room.tieGroup.includes(player.id)) { notify(socket, 'Hanya peserta yang sedang seri yang dapat menjawab tie-break.', 'warning'); return; }
      if (room.timerPaused) { notify(socket, 'Timer sedang dijeda host. Jawaban belum dapat dikirim.', 'warning'); return; }
      if (room.tieAnswers[player.id]) { notify(socket, 'Jawaban tie-break sudah terkunci.', 'warning'); return; }
      if (!room.timerPaused && room.questionDeadlineAt && Date.now() > room.questionDeadlineAt) { closeTieQuestion(room, 'Waktu tie-break habis'); return; }
      const submittedAt = Date.now();
      room.tieAnswers[player.id] = { choice, submittedAt, elapsedMs: Math.max(0, submittedAt - room.currentQuestionStartedAt) };
      audit(room, player.id, 'Menjawab tie-break', String.fromCharCode(65 + choice));
      if (room.tieGroup.every((id) => room.tieAnswers[id])) closeTieQuestion(room, 'Semua peserta tie-break sudah menjawab');
      else pushRoom(room);
      return;
    }
    if (room.phase !== 'question_active') { notify(socket, 'Soal belum aktif atau waktu menjawab sudah ditutup.', 'warning'); return; }
    if (room.timerPaused) { notify(socket, 'Timer sedang dijeda host. Jawaban belum dapat dikirim.', 'warning'); return; }
    if (room.questionAnswers[player.id]) { notify(socket, 'Jawaban sudah terkirim dan tidak dapat diubah.', 'warning'); return; }
    if (!room.timerPaused && room.questionDeadlineAt && Date.now() > room.questionDeadlineAt) { closeQuestion(room, 'Waktu habis'); return; }
    const submittedAt = Date.now();
    room.questionAnswers[player.id] = { choice, submittedAt, elapsedMs: Math.max(0, submittedAt - room.currentQuestionStartedAt) };
    audit(room, player.id, 'Mengunci jawaban', `Soal ${room.questionIndex + 1}; pilihan ${String.fromCharCode(65 + choice)}`);
    if (answerAllReceived(room)) closeQuestion(room, 'Semua peserta sudah mengunci jawaban');
    else pushRoom(room);
  });

  socket.on('cast_vote', (data = {}) => {
    const { room, player } = playerFromSocket(socket);
    if (!room || !player || player.role !== 'participant') return;
    if (room.phase !== 'voting') { notify(socket, 'Voting tidak sedang aktif.', 'warning'); return; }
    if (room.votes[player.id]) { notify(socket, 'Suara sudah tercatat dan tidak dapat diubah.', 'warning'); return; }
    if (room.voteDeadlineAt && Date.now() > room.voteDeadlineAt) { finishVoting(room, 'Waktu voting habis'); return; }
    const box = room.finalDifficultyBoxes.find((item) => item.id === String(data.boxId || ''));
    const difficulty = box ? box.difficulty : String(data.difficulty || '');
    if (!FINAL_DIFFICULTIES.some((d) => d.id === difficulty)) { notify(socket, 'Pilih salah satu kotak misteri yang tersedia.', 'error'); return; }
    room.votes[player.id] = difficulty;
    room.voteBoxChoices[player.id] = box?.id || room.finalDifficultyBoxes.find((item) => item.difficulty === difficulty)?.id || null;
    audit(room, player.id, 'Memberikan suara final', box ? box.label : difficultyLabel(difficulty));
    if (participants(room).every((p) => room.votes[p.id])) finishVoting(room, 'Semua peserta sudah memilih');
    else pushRoom(room);
  });

  socket.on('skip_punishment', () => {
    const { room, player } = playerFromSocket(socket);
    if (!room || !player || player.role !== 'participant' || room.phase !== 'results') return;
    const assignment = room.punishmentsByPlayer[player.id];
    if (!assignment?.spun || !assignment.text) { notify(socket, 'Tunggu host menyelesaikan roulette hukuman terlebih dahulu.', 'warning'); return; }
    player.skippedPunishment = true;
    if (assignment) assignment.skipped = true;
    audit(room, player.id, 'Melewati tantangan', 'Pilihan pemain dihormati');
    pushRoom(room);
  });

  socket.on('host_action', (data = {}) => {
    const { room, player } = playerFromSocket(socket);
    if (!room || !player) return;
    const result = handleHostAction(room, player, String(data.action || ''), data);
    if (!result.ok) notify(socket, result.message || 'Perintah tidak dapat dilakukan.', 'warning');
    else if (result.close) return;
    else {
      if (result.message) notify(socket, result.message, 'success');
      pushRoom(room);
    }
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    audit(room, player.id, 'Koneksi terputus', player.name);
    pushRoom(room);
    notifyRoom(room, `${player.name} terputus. Progres disimpan; pemain dapat masuk kembali dengan token sesi.`, 'warning');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cerdas Cermat Online berjalan pada http://localhost:${PORT}`);
  console.log(`Mode bank soal lokal saja: ${LOCAL_QUESTION_BANK.length} entri untuk 132 kombinasi + ${ECONOMY_FINAL_QUESTIONS.length} soal final Ilmu Ekonomi.`);
  console.log('Mode bank soal lokal aktif; API eksternal tidak diperlukan.');
});

// Tutup timer dengan aman ketika proses server dihentikan.
function shutdown() {
  for (const room of rooms.values()) {
    clearTimer(room);
    if (room.punishmentSpinHandle) clearTimeout(room.punishmentSpinHandle);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
