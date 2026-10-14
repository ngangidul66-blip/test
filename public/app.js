'use strict';

const app = document.getElementById('app');
const connectionPill = document.getElementById('connection-state');
const soundToggle = document.getElementById('sound-toggle');
const toastRegion = document.getElementById('toast-region');
const socket = io({ transports: ['websocket', 'polling'] });

const DIFFICULTIES = [
  { id: 'easy', label: 'Mudah', points: 10, icon: '◌' },
  { id: 'medium', label: 'Sedang', points: 20, icon: '◈' },
  { id: 'hard', label: 'Sulit', points: 30, icon: '◇' },
  { id: 'very_hard', label: 'Sangat Sulit', points: 40, icon: '✦' },
  { id: 'bonus', label: 'Bonus Tantangan', points: 50, icon: '⚡' },
];
const FINAL_DIFFICULTIES = DIFFICULTIES.filter((d) => d.id !== 'bonus');
const LEVELS = [
  { id: 'sd', label: 'SD' }, { id: 'smp', label: 'SMP' },
  { id: 'sma', label: 'SMA/SMK' }, { id: 'college', label: 'Perguruan Tinggi' },
];
const SUBJECTS = ['Matematika','Bahasa Indonesia','Bahasa Inggris','IPA','IPS','Sejarah','Geografi','PPKn','Ekonomi','Informatika','Pengetahuan Umum'];
const PUNISHMENTS = [
  'Menyanyikan satu lagu selama 30 detik',
  'Melakukan tantangan lucu pilihan host',
  'Menyampaikan pidato kemenangan palsu selama 30 detik',
  'Melakukan tebak gaya atau pantomim',
  'Menjawab satu soal bonus bersama host',
  'Menceritakan fakta unik selama 30 detik',
];

let state = null;
let session = readSession();
let serverOffset = 0;
let soundEnabled = true;
let audioContext = null;
let lastStateSignature = '';
let reconnectNoticeSeen = false;

function readSession() {
  try { return JSON.parse(localStorage.getItem('cc-online-session') || 'null'); }
  catch (_e) { return null; }
}
function saveSession(value) {
  session = value;
  if (value) localStorage.setItem('cc-online-session', JSON.stringify(value));
  else localStorage.removeItem('cc-online-session');
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function labelForDifficulty(id) { return DIFFICULTIES.find((d) => d.id === id)?.label || id || '—'; }
function labelForLevel(id) { return LEVELS.find((x) => x.id === id)?.label || id || '—'; }
function labelForStage(id) { return ({ difficulty: 'Tingkat Kesulitan', education: 'Tingkat Pendidikan', subject: 'Mata Pelajaran' })[id] || 'Pemilihan Kotak'; }
function currentServerNow() { return Date.now() + serverOffset; }
function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function shortTime(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return '—';
  return `${(Number(ms) / 1000).toFixed(1)} dtk`;
}
function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((x) => x.charAt(0).toUpperCase()).join('') || '?';
}
function sortedPlayers() {
  return (state?.players || []).slice().filter((p) => p.role === 'participant').sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.totalAnswerMs - b.totalAnswerMs);
}
function toast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  toastRegion.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(5px)'; setTimeout(() => el.remove(), 250); }, 3700);
  if (soundEnabled) playTone(kind === 'error' ? 180 : kind === 'success' ? 720 : 440, .07);
}
function playTone(freq = 440, duration = .07) {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + duration);
  } catch (_e) { /* audio is a nonessential enhancement */ }
}
function setConnection(status, label) {
  connectionPill.classList.remove('online', 'offline');
  if (status) connectionPill.classList.add(status);
  const span = connectionPill.querySelector('span');
  if (span) span.textContent = label;
}
function hostAction(action, data = {}) { socket.emit('host_action', { action, ...data }); }
function findSelf() { return state?.players?.find((p) => p.id === state.selfId) || null; }
function playerInitial(name, role) { return role === 'host' ? 'H' : initials(name); }
function playerCard(player) {
  const role = player.role === 'host' ? 'HOST' : 'PESERTA';
  const status = !player.connected ? '<span class="status-tag offline">Offline</span>' : player.role === 'host' ? '<span class="status-tag ready">Pengendali</span>' : player.ready ? '<span class="status-tag ready">Siap</span>' : '<span class="status-tag">Belum siap</span>';
  return `<div class="player-card ${player.role === 'host' ? 'host' : ''}">
    <div class="avatar">${escapeHtml(playerInitial(player.name, player.role))}</div>
    <div class="player-meta"><div class="player-name">${escapeHtml(player.name)} ${player.id === state.selfId ? '<span class="tiny">(Kamu)</span>' : ''}</div><div class="player-sub"><span>${role}</span><span>·</span><span>${player.connected ? 'Online' : 'Koneksi terputus'}</span></div></div>${status}
  </div>`;
}
function seatPlaceholder(index) {
  return `<div class="seat-card"><div class="seat-plus">＋</div><div><strong style="display:block;color:#99a8c7;font-size:11px">Kursi ${index}</strong><span style="display:block;font-size:10px;margin-top:4px">Menunggu pemain bergabung</span></div></div>`;
}
function penaltiesChecks(selected = PUNISHMENTS.slice(0, 4)) {
  return PUNISHMENTS.map((p, i) => `<label class="check-line"><input type="checkbox" name="penalty" value="${escapeHtml(p)}" ${selected.includes(p) ? 'checked' : ''}><span>${escapeHtml(p)}</span></label>`).join('');
}
function rulesItems() {
  const rules = [
    'Game terdiri dari 4 ronde utama dan 1 ronde final khusus Ilmu Ekonomi perguruan tinggi.',
    'Setiap ronde utama berisi 10 soal; ronde final juga berisi 10 soal. Total 50 soal.',
    'Pada setiap ronde utama, tiga tahap kotak menentukan kesulitan, tingkat pendidikan, dan mata pelajaran.',
    'Setiap soal aktif selama 40 detik. Kirim pilihan A, B, C, atau D sebelum timer berakhir.',
    'Jawaban terkunci setelah dikirim. Jawaban yang tidak masuk sampai waktu habis bernilai 0 poin.',
    'Kunci dan pembahasan tampil setidaknya 8 detik, lalu tetap terlihat hingga host melanjutkan.',
    'Di ronde final, ketiga peserta melakukan voting rahasia untuk menentukan tingkat kesulitan ekonomi.',
    'Mudah 10 poin, Sedang 20, Sulit 30, Sangat Sulit 40, dan Bonus Tantangan 50 poin.',
    'Peringkat ditentukan dari skor, jumlah jawaban benar, lalu waktu menjawab total. Seri yang tersisa menggunakan soal tie-break.',
    'Juara kedua dan ketiga mendapat tantangan ringan yang dipilih sebelum bermain. Tantangan dapat dilewati jika tidak nyaman.',
  ];
  return rules.map((rule, i) => `<div class="rules-item"><span class="rule-number">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(rule)}</span></div>`).join('');
}
function renderHome() {
  const urlParams = new URLSearchParams(window.location.search);
  const presetRoom = (urlParams.get('room') || '').toUpperCase().slice(0, 6);
  app.innerHTML = `<section class="screen">
    <div class="home-hero">
      <div class="hero-copy">
        <span class="eyebrow">ARENA CERDAS CERMAT ONLINE</span>
        <h1>Otak siap.<span class="gradient-text">Kotak dibuka.</span>Juara ditentukan.</h1>
        <p class="lead">Bikin room privat, ajak tiga teman, lalu adu wawasan lewat kotak misteri, soal cepat, voting final, dan papan skor real-time.</p>
        <div class="hero-badges"><span class="pill"><i class="dot"></i> Multiplayer real-time</span><span class="pill purple"><i class="dot"></i> 5 ronde · 50 soal</span><span class="pill gold"><i class="dot"></i> 40 detik per soal</span></div>
        <div class="button-row"><a class="button outline" href="#room-entry" style="text-decoration:none">Masuk arena <span>↓</span></a><span class="tiny">Gratis dimainkan lewat browser</span></div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="visual-top"><span>ARENA / 01</span><span class="live-label">LIVE MATCH</span></div>
        <div class="mystery-stage"><div class="mystery-tile">?<small>kotak 01</small></div><div class="mystery-tile">✦<small>kotak 02</small></div><div class="mystery-tile">?<small>kotak 03</small></div></div>
        <div class="visual-bottom"><div class="visual-score"><small>Hadiah poin</small><strong>+50 <span style="font-size:12px;color:var(--cyan)">PTS</span></strong></div><div class="visual-scores"><span class="avatar-dot">RA</span><span class="avatar-dot">DI</span><span class="avatar-dot">NA</span><span class="avatar-dot" style="color:var(--cyan)">+1</span></div></div>
      </div>
    </div>
    <div id="room-entry" class="entry-grid">
      <form id="create-form" class="panel">
        <div class="panel-header"><div class="panel-icon">✦</div><div><h3>Buat room baru</h3><p>Jadilah host dan kendalikan jalannya kuis.</p></div></div>
        <div class="field"><label for="host-name">Nama host</label><input class="input" id="host-name" name="name" maxlength="18" placeholder="Contoh: Kak Raka" required></div>
        <details class="setting-box"><summary class="setting-title"><span>Pengaturan awal permainan</span><span>＋</span></summary>
          <div class="field" style="margin-top:12px"><label for="vote-seconds">Durasi voting final</label><select class="input" name="votingSeconds" id="vote-seconds"><option value="15">15 detik</option><option value="30" selected>30 detik</option><option value="45">45 detik</option><option value="60">60 detik</option><option value="90">90 detik</option></select></div>
          <div class="setting-title"><span>Daftar tantangan</span><span class="tiny">Bisa dilewati pemain</span></div><div class="check-list">${penaltiesChecks()}</div>
          <label class="check-line" style="margin-top:12px"><input type="checkbox" name="randomPunishments"><span>Acak tantangan untuk juara kedua dan ketiga</span></label>
        </details>
        <button class="button primary full" type="submit">Buat room <span>↗</span></button>
        <p class="tiny" style="margin:12px 0 0">Room hanya bisa dimulai jika tepat 3 peserta sudah bergabung dan siap.</p>
      </form>
      <form id="join-form" class="panel">
        <div class="panel-header"><div class="panel-icon cyan">⌁</div><div><h3>Gabung ke room</h3><p>Masukkan kode dari host untuk ikut bermain.</p></div></div>
        <div class="field"><label for="player-name">Nama peserta</label><input class="input" id="player-name" name="name" maxlength="18" placeholder="Nama panggilanmu" required></div>
        <div class="field"><label for="room-code-input">Kode room</label><input class="input" id="room-code-input" name="roomCode" value="${escapeHtml(presetRoom)}" placeholder="MIS. A7K3P9" maxlength="6" autocapitalize="characters" required style="text-transform:uppercase;letter-spacing:.16em;font-family:'Space Grotesk',sans-serif;font-weight:700"></div>
        <button class="button blue full" type="submit">Gabung ke permainan <span>→</span></button>
        <div class="notice-bar cyan" style="margin-top:16px"><span>ⓘ</span><span>Kalau koneksi putus di tengah permainan, buka kembali halaman ini dari perangkat yang sama. Progres sesi akan dipulihkan dengan token lokal.</span></div>
      </form>
    </div>
  </section>`;
}
function renderLobbySettings() {
  const s = state.settings || {};
  return `<form id="lobby-settings" class="panel">
    <div class="panel-header"><div class="panel-icon">⚙</div><div><h3>Atur tantangan</h3><p>Aturan aman dan menyenangkan untuk podium kedua dan ketiga.</p></div></div>
    <div class="field"><label for="lobby-vote-seconds">Durasi voting final</label><select class="input" name="votingSeconds" id="lobby-vote-seconds">${[15,30,45,60,90].map((n) => `<option value="${n}" ${Number(s.votingSeconds) === n ? 'selected' : ''}>${n} detik</option>`).join('')}</select></div>
    <div class="setting-box"><div class="setting-title"><span>Pilih tantangan</span><span class="tiny">Minimal 1</span></div><div class="check-list">${penaltiesChecks(s.penalties || PUNISHMENTS.slice(0,4))}</div>
      <label class="check-line" style="margin-top:12px"><input type="checkbox" name="randomPunishments" ${s.randomPunishments ? 'checked' : ''}><span>Acak tantangan untuk posisi 2 dan 3</span></label>
    </div>
    <button class="button outline full" type="submit">Simpan pengaturan</button>
    <div class="host-section"><div class="sidebar-title"><span class="mini-dot"></span> SEBELUM MULAI</div>
      <div class="room-rule"><span class="rule-check">✓</span><span>Pastikan semua peserta sudah siap.</span></div>
      <div class="room-rule"><span class="rule-check">✓</span><span>Peserta akan membaca aturan di halaman berikutnya.</span></div>
      <div class="room-rule"><span class="rule-check">✓</span><span>Kamu memegang kendali timer dan perpindahan soal.</span></div>
    </div>
    <button class="button primary full" style="margin-top:16px" data-action="begin_rules" ${state.players.length !== 4 || state.players.some((p) => p.role === 'participant' && (!p.connected || !p.ready)) ? 'disabled' : ''}>Mulai tutorial <span>→</span></button>
    <p class="tiny" style="margin:10px 0 0">Host dapat memulai setelah tepat 3 peserta online dan siap.</p>
    <button class="button danger full small-button" style="margin-top:10px" data-action="end_room">Tutup room</button>
  </form>`;
}
function renderLobby() {
  const isHost = state.role === 'host';
  const placeholders = Math.max(0, 4 - state.players.length);
  const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(state.roomCode)}`;
  return `<section class="screen">
    <div class="section-heading"><div><span class="eyebrow">RUANG TUNGGU</span><h2>Siapkan timmu.</h2><p>${isHost ? 'Bagikan kode di bawah ke tiga temanmu.' : 'Kamu sudah masuk. Tunggu host memulai permainan.'}</p></div>
      <div class="room-code"><div><span>KODE ROOM</span><strong>${escapeHtml(state.roomCode)}</strong></div><button type="button" data-action="copy-room" aria-label="Salin kode room" title="Salin kode">⧉</button></div>
    </div>
    <div class="lobby-layout"><div class="panel"><div class="section-heading" style="margin-bottom:16px"><div><h3 style="margin:0">Pemain di room</h3><p>${state.players.length} dari 4 slot terisi</p></div><span class="pill"><i class="dot"></i>${state.players.length === 4 ? 'Room penuh' : 'Menunggu pemain'}</span></div>
      <div class="progress-track" style="margin-bottom:18px"><span style="width:${state.players.length / 4 * 100}%"></span></div>
      <div class="player-grid">${state.players.map(playerCard).join('')}${Array.from({ length: placeholders }, (_, i) => seatPlaceholder(state.players.length + i + 1)).join('')}</div>
      <div class="host-section"><div class="sidebar-title"><span class="mini-dot"></span> LINK UNDANGAN</div><div class="field"><input class="input" id="invite-link" value="${escapeHtml(link)}" readonly></div><div class="button-row"><button class="button outline small-button" data-action="copy-link">Salin tautan undangan</button><span class="tiny">Tautan mengisi kode room otomatis.</span></div></div>
      ${!isHost ? `<div class="host-section"><div class="notice-bar ${findSelf()?.ready ? 'cyan' : ''}"><span>◎</span><span>${findSelf()?.ready ? 'Kamu sudah siap. Host dapat memulai tutorial setelah semua peserta siap.' : 'Tekan tombol siap saat kamu telah siap bermain.'}</span></div><div class="button-row" style="margin-top:14px"><button class="button ${findSelf()?.ready ? 'outline' : 'primary'}" data-action="toggle-ready">${findSelf()?.ready ? 'Batalkan kesiapan' : 'Saya siap bermain'} ${findSelf()?.ready ? '↺' : '✓'}</button></div></div>` : ''}
    </div>
    <div>${isHost ? renderLobbySettings() : `<div class="panel"><div class="panel-header"><div class="panel-icon cyan">⌁</div><div><h3>Yang perlu kamu tahu</h3><p>Ringkasan sebelum masuk arena.</p></div></div><div class="room-rule"><span class="rule-check">✓</span><span>Kamu bermain sebagai peserta, bukan host.</span></div><div class="room-rule"><span class="rule-check">✓</span><span>Hanya host yang memulai ronde, menghentikan timer, dan melanjutkan soal.</span></div><div class="room-rule"><span class="rule-check">✓</span><span>Jawabanmu terkunci setelah dikirim dan tidak terlihat pemain lain saat soal aktif.</span></div><div class="room-rule"><span class="rule-check">✓</span><span>Jika terputus, masuk kembali memakai token sesi yang tersimpan di browser ini.</span></div><div class="host-section"><span class="host-tag">PESERTA</span><p class="small muted" style="margin:10px 0 0">Host akan mengawasi status online, pilihan kotak, jawaban, dan skor selama pertandingan.</p></div></div>`}</div>
    </div>
  </section>`;
}
function renderRules() {
  const isHost = state.role === 'host';
  const accepted = findSelf()?.rulesAccepted;
  const allAccepted = state.players.every((p) => p.rulesAccepted && p.connected);
  return `<section class="screen">
    <div class="section-heading"><div><span class="eyebrow">BRIEFING PEMAIN</span><h2>Kenali aturan mainnya.</h2><p>Semua pemain harus memahami alur sebelum soal pertama dibuka.</p></div><div class="room-code"><div><span>ROOM</span><strong>${escapeHtml(state.roomCode)}</strong></div></div></div>
    <div class="rules-grid"><div class="panel"><div class="sidebar-title"><span class="mini-dot"></span> CARA BERMAIN</div><div class="rules-list">${rulesItems()}</div></div>
      <div class="panel"><div class="panel-header"><div class="panel-icon cyan">✓</div><div><h3>Konfirmasi aturan</h3><p>Progres pemain disinkronkan ke semua perangkat.</p></div></div>
        ${state.players.map((p) => `<div class="participant-mini"><div><div class="mini-name">${escapeHtml(p.name)} ${p.role === 'host' ? '<span class="tiny">· HOST</span>' : ''}</div><div class="mini-meta">${p.connected ? 'Online' : 'Offline'}</div></div><span class="answer-status ${p.rulesAccepted ? 'ok' : ''}">${p.rulesAccepted ? 'Mengerti' : 'Belum'}</span></div>`).join('')}
        <div class="host-section"><div class="progress-track"><span style="width:${state.players.filter((p) => p.rulesAccepted && p.connected).length / 4 * 100}%"></span></div><p class="tiny" style="margin:9px 0 13px">${state.players.filter((p) => p.rulesAccepted && p.connected).length} dari 4 pemain sudah mengerti aturan.</p>
          ${!isHost ? `<button class="button ${accepted ? 'outline' : 'primary'} full" data-action="ack-rules" ${accepted ? 'disabled' : ''}>${accepted ? '✓ Kamu sudah mengerti' : 'Saya Mengerti, Mulai Permainan'}</button>` : `<button class="button primary full" data-action="start_game" ${!allAccepted ? 'disabled' : ''}>Mulai Ronde 1 <span>→</span></button><p class="tiny" style="margin:10px 0 0">Tombol aktif setelah semua pemain mengonfirmasi aturan.</p>`}
        </div>
      </div>
    </div>
  </section>`;
}
function scoreStrip() {
  return `<div class="score-strip">${state.players.filter((p) => p.role === 'participant').slice().sort((a,b) => b.score-a.score).map((p) => `<div class="score-chip"><div class="score-avatar">${escapeHtml(initials(p.name))}</div><span><strong>${escapeHtml(p.name)}</strong><small>${p.score} poin</small></span></div>`).join('')}</div>`;
}
function gameTopbar() {
  return `<div class="game-topbar"><div class="round-chip"><span class="round-symbol">${state.roundIndex === 4 ? '₊' : String(state.roundNumber).padStart(2,'0')}</span><span><strong>${escapeHtml(state.roundLabel)}</strong><small>${state.roundIndex === 4 ? `Kesulitan final: ${escapeHtml(labelForDifficulty(state.voting.finalDifficulty || state.selection.difficulty))}` : 'Pilih kotak · jawab cepat · kumpulkan poin'}</small></span></div>${scoreStrip()}</div>`;
}
function hostSidebar(extra = '') {
  if (state.role !== 'host') return '';
  const people = state.players.filter((p) => p.role === 'participant');
  const answerRows = state.hostData?.players || [];
  const showAnswers = ['question_ready','question_active','review','tiebreak_active','tiebreak_review'].includes(state.phase);
  const answerSection = showAnswers ? `<div class="panel"><div class="sidebar-title"><span class="mini-dot"></span> STATUS JAWABAN</div><div class="host-answer-list">${answerRows.map((p) => {
    const result = p.result;
    const answer = p.answer;
    const status = result ? result.status : answer ? 'Terkirim' : 'Menunggu';
    const cls = result ? (result.status === 'Benar' ? 'ok' : result.status === 'Salah' ? 'no' : '') : answer ? 'ok' : '';
    return `<div class="host-answer-row"><div><strong>${escapeHtml(p.name)}</strong><small>${answer ? `${escapeHtml(answer.choiceLabel)} · ${shortTime(answer.elapsedMs)}` : 'Belum mengirim jawaban'}</small></div><span class="answer-status ${cls}">${escapeHtml(status)}</span></div>`;
  }).join('')}</div></div>` : '';
  const logRows = state.hostData?.logs?.slice(0, 7) || [];
  return `<aside class="host-sidebar">
    <div class="panel"><div class="sidebar-title"><span class="mini-dot"></span> DASHBOARD HOST <span class="host-tag" style="margin-left:auto">ADMIN</span></div>
      ${people.map((p) => `<div class="participant-mini"><div><div class="mini-name">${escapeHtml(p.name)}</div><div class="mini-meta">${!p.connected ? 'Offline · progres tersimpan' : p.ready ? 'Siap' : 'Online'} · ${p.correctCount} benar</div></div><div class="mini-score">${p.score}</div></div>`).join('')}
      ${extra}
      <div class="host-section"><button class="button outline full small-button" data-action="restart_session">Reset sesi dan kembali ke lobby ↻</button><p class="tiny" style="margin:8px 0 0">Semua skor dan progres ronde saat ini akan dihapus.</p></div>
    </div>
    ${answerSection}
    <div class="panel"><div class="sidebar-title"><span class="mini-dot"></span> RIWAYAT AKTIVITAS</div>${logRows.length ? logRows.map((l) => `<div class="activity-row"><span class="activity-mark"></span><div class="activity-copy"><strong>${escapeHtml(l.actor)} · ${escapeHtml(l.action)}</strong><small>${escapeHtml(l.detail || '')}</small></div></div>`).join('') : '<div class="empty-state">Aktivitas akan muncul di sini.</div>'}</div>
  </aside>`;
}
function gameFrame(main, extra = '') {
  return `<section class="screen">${gameTopbar()}<div class="game-layout"><div class="game-main">${main}</div>${state.role === 'host' ? hostSidebar(extra) : participantSidebar()}</div></section>`;
}
function participantSidebar() {
  const players = state.players.filter((p) => p.role === 'participant').slice().sort((a,b) => b.score-a.score);
  return `<aside class="host-sidebar"><div class="panel"><div class="sidebar-title"><span class="mini-dot"></span> PAPAN SKOR SEMENTARA</div>${players.map((p,i) => `<div class="participant-mini"><div><div class="mini-name">${i + 1}. ${escapeHtml(p.name)} ${p.id === state.selfId ? '<span class="tiny">(Kamu)</span>' : ''}</div><div class="mini-meta">${p.correctCount} jawaban benar</div></div><div class="mini-score">${p.score}</div></div>`).join('')}<p class="tiny" style="margin:12px 0 0">Papan skor resmi ditampilkan setiap ronde selesai.</p></div><div class="panel"><div class="sidebar-title"><span class="mini-dot"></span> TIPS ARENA</div><div class="room-rule"><span class="rule-check">↗</span><span>Jawaban hanya bisa dikirim satu kali.</span></div><div class="room-rule"><span class="rule-check">◷</span><span>Waktu tersinkron dari server; jangan menunggu hingga detik terakhir.</span></div><div class="room-rule"><span class="rule-check">✦</span><span>Pembahasan tetap tampil sampai host melanjutkan.</span></div></div></aside>`;
}
function renderSelection() {
  const stage = state.selectionStage;
  const stageIdx = state.selectionStageIndex;
  const isHost = state.role === 'host';
  const chooser = state.selectionChooser?.name || 'peserta';
  const stageTitle = labelForStage(stage);
  const stageDescription = stage === 'difficulty' ? 'Pilih kotak misteri yang menyimpan tingkat kesulitan soal.' : stage === 'education' ? 'Tentukan jenjang pendidikan yang menjadi acuan materi.' : 'Pilih mata pelajaran untuk membentuk paket 10 soal ronde ini.';
  const boxMarkup = state.boxes.map((box) => {
    const canClick = isHost || state.isMySelectionTurn;
    const text = box.revealed ? box.valueLabel : (isHost ? box.valueLabel : 'Misteri');
    return `<button class="mystery-box ${box.selected ? 'selected' : ''}" type="button" data-action="select-box" data-box-id="${escapeHtml(box.id)}" ${!canClick || box.selected ? 'disabled' : ''}><span class="box-icon">${box.selected ? '✓' : box.revealed ? '✦' : '▧'}</span><span class="box-label">${escapeHtml(box.label)}</span><span class="box-value">${escapeHtml(text || '?')}</span></button>`;
  }).join('');
  const statusText = isHost ? `Host dapat membantu membuka kotak kapan saja. Giliran memilih saat ini: ${chooser}.` : state.isMySelectionTurn ? 'Ini giliranmu! Pilih satu kotak. Isi kotak lainnya akan tetap dirahasiakan sampai dipilih.' : `Tunggu ${escapeHtml(chooser)} memilih kotak. Pilihan akan terbuka serentak di semua layar.`;
  const summaries = `<div class="selection-summary"><span class="selection-tag">Kesulitan <strong>${escapeHtml(state.selection.difficultyLabel || 'Belum dipilih')}</strong></span><span class="selection-tag">Pendidikan <strong>${escapeHtml(state.selection.educationLabel || 'Belum dipilih')}</strong></span><span class="selection-tag">Mapel <strong>${escapeHtml(state.selection.subject || 'Belum dipilih')}</strong></span></div>`;
  const main = `<div class="stage-panel"><div class="stage-header"><div><span class="eyebrow">KOTAK MISTERI</span><h2>${escapeHtml(stageTitle)}</h2><p>${escapeHtml(stageDescription)}</p></div><span class="stage-step">TAHAP ${stageIdx + 1} / 3</span></div>
    <div class="step-track">${['difficulty','education','subject'].map((s,i) => `<div class="step-cell ${i === stageIdx ? 'active' : i < stageIdx ? 'done' : ''}"><b>${i < stageIdx ? '✓' : i + 1}</b><span>${['Kesulitan','Pendidikan','Mapel'][i]}</span></div>`).join('')}</div>
    <div class="notice-bar cyan" style="margin:0 0 18px"><span>✦</span><span>${statusText}</span></div>
    <div class="box-grid">${boxMarkup}</div>${summaries}
    ${isHost ? `<div class="notice-bar" style="margin-top:17px"><span>ⓘ</span><span>Label isi kotak tampil khusus di dashboard host. Klik salah satu kotak untuk membuka atau membantu peserta yang sedang offline.</span></div>` : ''}
  </div>`;
  return gameFrame(main);
}
function questionSetNotice() {
  const meta = state.questionSetMeta;
  if (!meta || state.roundIndex === 4) return '';
  const exact = Math.min(10, Number(meta.exactCount) || 0);
  if (exact === 10) return `<div class="notice-bar cyan"><span>✓</span><span>Sepuluh soal cocok dengan mapel, jenjang, dan kesulitan yang terpilih.</span></div>`;
  return `<div class="notice-bar"><span>ⓘ</span><span><strong>${exact}/10 soal cocok persis.</strong> Paket dilengkapi otomatis dari bank soal dengan kecocokan terbaik agar ronde tetap berisi 10 soal tanpa placeholder. Host bisa mengganti mapel sebelum soal pertama aktif.</span></div>`;
}
function replaceSubjectControl() {
  if (state.role !== 'host' || state.roundIndex === 4) return '';
  return `<div class="host-section"><div class="field"><label for="replacement-subject">Mapel pengganti (opsional)</label><select id="replacement-subject" class="input">${SUBJECTS.map((s) => `<option value="${escapeHtml(s)}" ${state.selection.subject === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select></div><button class="button outline small-button" data-action="replace-subject">Gunakan mapel pengganti</button></div>`;
}
function questionEditor(q, mode) {
  if (!q || !Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(Number(q.answer))) return '';
  const label = mode === 'next' ? 'Koreksi soal berikutnya' : 'Koreksi soal ini';
  return `<details class="setting-box question-editor"><summary class="setting-title"><span>✎ ${label}</span><span>＋</span></summary>
    <form id="question-edit-form" data-mode="${mode}" style="margin-top:14px">
      <div class="field"><label for="edit-question">Teks pertanyaan</label><textarea class="input" id="edit-question" name="question" maxlength="500" required>${escapeHtml(q.question)}</textarea></div>
      <div class="question-edit-options">${q.options.map((option, i) => `<div class="field"><label for="edit-option-${i}">Pilihan ${String.fromCharCode(65+i)}</label><input class="input" id="edit-option-${i}" name="option${i}" value="${escapeHtml(option)}" maxlength="240" required></div>`).join('')}</div>
      <div class="field"><label for="edit-answer">Kunci jawaban yang benar</label><select class="input" id="edit-answer" name="answer">${q.options.map((option, i) => `<option value="${i}" ${Number(q.answer) === i ? 'selected' : ''}>${String.fromCharCode(65+i)} — ${escapeHtml(option)}</option>`).join('')}</select></div>
      <div class="field"><label for="edit-explanation">Penjelasan jawaban</label><textarea class="input" id="edit-explanation" name="explanation" maxlength="1200" required>${escapeHtml(q.explanation || '')}</textarea></div>
      <button class="button outline full" type="submit">Simpan koreksi soal</button>
    </form></details>`;
}
function renderQuestionReady() {
  const q = state.question;
  if (!q) return gameFrame('<div class="empty-state">Paket soal belum tersedia. Host perlu menyelesaikan pemilihan kotak.</div>');
  const isHost = state.role === 'host';
  const options = q.options.map((option,i) => `<button class="answer-option" disabled><span class="answer-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(option)}</span></button>`).join('');
  const isTie = state.roundIndex === 4 && q.subject === 'Tie-break';
  const subtitle = isTie ? 'Pertanyaan tambahan untuk menentukan peringkat yang masih seri.' : state.roundIndex === 4 ? 'Final Ilmu Ekonomi perguruan tinggi. Kesulitan sudah ditentukan lewat voting.' : 'Paket sudah siap. Timer baru dimulai ketika host mengaktifkan soal.';
  const main = `<div class="stage-panel question-card"><div class="stage-header"><div><span class="eyebrow">${isTie ? 'PENENTU PERINGKAT' : state.roundIndex === 4 ? 'RONDE FINAL' : 'PAKET SOAL SIAP'}</span><h2>${isTie ? 'Soal tie-break' : `Soal ${state.questionNumber} dari ${state.totalQuestions}`}</h2><p>${escapeHtml(subtitle)}</p></div><span class="host-tag">BELUM AKTIF</span></div>
    ${!isTie ? `<div class="question-topline"><div class="question-tags"><span class="tag accent">${escapeHtml(q.subject)}</span><span class="tag">${escapeHtml(labelForLevel(q.level))}</span><span class="tag">${escapeHtml(labelForDifficulty(q.difficulty))}</span></div><span class="question-counter">+${state.pointsForCorrect || 0} poin</span></div>` : ''}
    <div class="question-text">${escapeHtml(q.question)}</div><div class="answer-grid">${options}</div>
    <div class="question-footer"><div class="question-note"><span class="note-icon">◷</span><span>Waktu menjawab <strong style="color:var(--text)">40 detik</strong><br>Timer dimulai saat host menekan tombol.</span></div>${isHost ? `<div class="button-row"><button class="button primary" data-action="start_question">${isTie ? 'Mulai tie-break' : 'Mulai Soal'} <span>→</span></button>${!isTie && state.roundIndex < 4 ? `<button class="button danger small-button" data-action="end_round">Akhiri ronde</button>` : ''}</div>` : `<span class="pill"><i class="dot" style="background:var(--gold)"></i>Menunggu host</span>`}</div>
    ${!isTie ? questionSetNotice() : `<div class="notice-bar"><span>⚖</span><span>Peserta yang masih seri: ${state.tieGroup.map(escapeHtml).join(', ')}. Jawaban benar tercepat menentukan urutan.</span></div>`}
    ${!isTie ? replaceSubjectControl() : ''}
    ${isHost && !isTie ? questionEditor(q, 'current') : ''}
  </div>`;
  return gameFrame(main);
}
function timerWidget(type, deadline, remaining, duration, paused = false) {
  const seconds = Math.ceil(Math.max(0, Number(remaining) || 0) / 1000);
  const pct = duration > 0 ? Math.max(0, Math.min(100, ((Number(remaining) || 0) / duration) * 100)) : 0;
  return `<div class="timer-card"><div class="timer-ring" data-ring="${type}" style="--timer-pct:${pct}%"><strong data-clock="${type}">${formatTime(remaining)}</strong></div><div class="timer-copy"><strong>${paused ? 'Timer dijeda' : type === 'review' ? 'Pembahasan' : type === 'vote' ? 'Sisa voting' : 'Sisa waktu'}</strong><small data-timer-caption="${type}">${paused ? 'Menunggu host melanjutkan' : type === 'review' ? 'Tombol aktif setelah 8 detik' : `${Math.ceil(seconds)} detik tersisa`}</small></div></div>`;
}
function activeRemaining() {
  if (state.timerPaused) return state.remainingMs || 0;
  if (state.questionDeadlineAt) return Math.max(0, state.questionDeadlineAt - currentServerNow());
  return state.remainingMs || 0;
}
function renderQuestionActive() {
  const q = state.question;
  if (!q) return gameFrame('<div class="empty-state">Soal belum tersedia.</div>');
  const isHost = state.role === 'host';
  const isTie = state.phase === 'tiebreak_active';
  const ownAnswer = isTie ? state.tieAnswers?.[state.selfId] : state.questionAnswers?.[state.selfId];
  const self = findSelf();
  const eligibleTie = !isTie || (state.tieGroupIds || []).includes(state.selfId);
  const canAnswer = !isHost && !ownAnswer && !state.timerPaused && eligibleTie;
  const options = q.options.map((option,i) => {
    const selected = ownAnswer && Number(ownAnswer.choice) === i;
    return `<button class="answer-option ${selected ? 'selected-answer' : ''}" data-action="answer" data-choice="${i}" ${canAnswer ? '' : 'disabled'}><span class="answer-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(option)}</span></button>`;
  }).join('');
  let note = isHost ? 'Pantau jawaban dari dashboard host. Pilihan tiap peserta tidak ditampilkan ke peserta lain.' : ownAnswer ? `Jawabanmu (${String.fromCharCode(65 + Number(ownAnswer.choice))}) sudah terkirim dan terkunci.` : isTie && !eligibleTie ? 'Kamu tetap bisa menyaksikan, tetapi tidak termasuk peserta yang sedang seri.' : state.timerPaused ? 'Timer dijeda oleh host. Pilihan jawaban sementara dinonaktifkan.' : 'Pilih satu jawaban. Setelah terkirim, kamu tidak bisa menggantinya.';
  const extraControls = isHost ? `<div class="button-row">${state.timerPaused ? `<button class="button primary small-button" data-action="resume_timer">Lanjutkan timer</button>` : `<button class="button outline small-button" data-action="pause_timer">Jeda timer</button>`}<button class="button danger small-button" data-action="end_question">Akhiri soal</button>${state.roundIndex < 4 ? `<button class="button danger small-button" data-action="end_round">Akhiri ronde</button>` : ''}</div>` : '';
  const main = `<div class="stage-panel question-card"><div class="stage-header"><div><span class="eyebrow">${isTie ? 'SOAL PENENTU SERI' : 'WAKTU MENJAWAB'}</span><h2>${isTie ? 'Tie-break' : `Soal ${state.questionNumber} <span class="muted" style="font-size:16px">/ ${state.totalQuestions}</span>`}</h2><p>${isTie ? `Peringkat masih seri antara ${state.tieGroup.map(escapeHtml).join(', ')}.` : 'Baca baik-baik dan kirim satu jawaban sebelum waktu habis.'}</p></div>${timerWidget('question', state.questionDeadlineAt, activeRemaining(), 40000, state.timerPaused)}</div>
    <div class="question-topline"><div class="question-tags"><span class="tag accent">${escapeHtml(q.subject)}</span><span class="tag">${escapeHtml(labelForLevel(q.level))}</span><span class="tag">${escapeHtml(labelForDifficulty(q.difficulty))}</span></div>${!isTie ? `<span class="question-counter">+${state.pointsForCorrect || 0} poin jika benar</span>` : '<span class="host-tag">TIE-BREAK</span>'}</div>
    <div class="question-text">${escapeHtml(q.question)}</div><div class="answer-grid">${options}</div>
    <div class="question-footer"><div class="question-note"><span class="note-icon">${ownAnswer ? '✓' : '◷'}</span><span>${escapeHtml(note)}</span></div>${extraControls}</div>
    <div class="timer-progress"><span data-progress="question" style="width:${Math.max(0,Math.min(100,activeRemaining()/40000*100))}%"></span></div>
  </div>`;
  return gameFrame(main);
}
function renderReview() {
  const q = state.question;
  if (!q) return gameFrame('<div class="empty-state">Pembahasan tidak tersedia.</div>');
  const isHost = state.role === 'host';
  const isTie = state.phase === 'tiebreak_review';
  const correctAnswer = q.answer;
  const correctResult = state.questionResults?.[state.selfId];
  const keyOptions = q.options.map((option,i) => {
    let cls = i === correctAnswer ? 'correct-answer' : '';
    if (!isTie && correctResult && correctResult.choice === i && i !== correctAnswer) cls = 'wrong-answer';
    return `<div class="answer-option ${cls}" style="cursor:default"><span class="answer-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(option)}</span>${i === correctAnswer ? '<span style="margin-left:auto;color:var(--green);font-weight:700">✓</span>' : ''}</div>`;
  }).join('');
  const gate = isTie ? state.reviewReadyAt : state.reviewReadyAt;
  const remaining = Math.max(0, (gate || currentServerNow()) - currentServerNow());
  const lastQuestion = isTie || state.questionNumber >= state.totalQuestions;
  const buttonLabel = isTie ? 'Selesaikan tie-break' : state.endRoundAfterReview ? 'Selesaikan ronde' : lastQuestion ? (state.roundIndex === 4 ? 'Lihat hasil akhir' : 'Selesaikan ronde') : 'Soal Selanjutnya';
  const action = isTie ? 'finish_tiebreak' : 'next_question';
  const myResult = isTie ? state.tieAnswers?.[state.selfId] : state.questionResults?.[state.selfId];
  const ownStatus = isTie ? (myResult ? (myResult.choice === q.answer ? 'Tie-break benar' : 'Tie-break salah') : 'Tidak menjawab tie-break') : (myResult?.status || 'Tidak menjawab');
  const ownPoints = isTie ? null : (myResult?.pointsEarned ?? 0);
  const main = `<div class="stage-panel question-card"><div class="question-review-head"><div><span class="eyebrow">${isTie ? 'HASIL PENENTU SERI' : 'KUNCI JAWABAN & PEMBAHASAN'}</span><h2>${isTie ? 'Jawaban tie-break' : `Pembahasan soal ${state.questionNumber}`}</h2><p class="muted small" style="margin:0">${isTie ? 'Hasil ini akan digunakan untuk mengurutkan pemain yang masih seri.' : 'Kunci jawaban terlihat bagi semua pemain. Host yang menentukan kapan berlanjut.'}</p></div>${ownPoints != null ? `<div class="points-earned">${ownPoints > 0 ? '+' : ''}${ownPoints} poin</div>` : ''}</div>
    <div class="question-text" style="font-size:18px;margin-top:22px">${escapeHtml(q.question)}</div><div class="answer-grid">${keyOptions}</div>
    <div class="explanation-box"><div class="explanation-title"><span>✓</span> JAWABAN BENAR: ${String.fromCharCode(65 + correctAnswer)}</div><p>${escapeHtml(q.explanation || 'Jawaban sesuai dengan kunci pada bank soal.')}</p></div>
    ${!isTie ? `<div class="notice-bar cyan"><span>◎</span><span>Status jawabanmu: <strong>${escapeHtml(ownStatus)}</strong>${ownPoints != null ? ` · ${ownPoints} poin` : ''}. Tidak ada jawaban yang bisa diubah setelah soal ditutup.</span></div>` : ''}
    <div class="question-footer"><div style="flex:1;min-width:180px">${timerWidget('review', gate, remaining, 8000, false)}</div>${isHost ? `<div class="button-row"><button class="button primary" data-action="${action}" data-unlock-at="${Number(gate) || 0}" ${currentServerNow() < Number(gate) ? 'disabled' : ''}>${escapeHtml(buttonLabel)} <span>→</span></button>${!isTie && !lastQuestion && state.roundIndex < 4 && !state.endRoundAfterReview ? `<button class="button danger small-button" data-action="end_round" data-unlock-at="${Number(gate) || 0}" ${currentServerNow() < Number(gate) ? 'disabled' : ''}>Akhiri ronde</button>` : ''}</div>` : `<span class="pill"><i class="dot"></i>Menunggu host melanjutkan</span>`}</div>
    ${state.nextQuestionPreview ? `<div class="preview-card"><div class="preview-label"><span>↳</span> Soal berikutnya siap setelah pembahasan</div><strong>${escapeHtml(state.nextQuestionPreview.question)}</strong><div class="question-tags" style="margin-top:9px"><span class="tag">${escapeHtml(state.nextQuestionPreview.subject)}</span><span class="tag">Belum aktif</span></div>${isHost ? questionEditor(state.nextQuestionPreview, 'next') : ''}</div>` : ''}
  </div>`;
  return gameFrame(main);
}
function renderRoundScore() {
  const ranked = state.players.filter((p) => p.role === 'participant').slice().sort((a,b) => b.score-a.score || b.correctCount-a.correctCount || a.totalAnswerMs-b.totalAnswerMs);
  const label = state.roundIndex === 3 ? 'Empat ronde utama selesai.' : `Ronde ${state.roundIndex + 1} selesai.`;
  const isHost = state.role === 'host';
  const main = `<div class="stage-panel"><span class="eyebrow">PAPAN SKOR</span><h2>${escapeHtml(label)}</h2><p class="muted small">Skor telah diperbarui oleh server untuk seluruh peserta. Urutan sementara mengikuti skor, jumlah jawaban benar, lalu waktu menjawab.</p>
    <div class="inline-stat-row"><div class="inline-stat"><strong>10</strong><small>Soal di ronde ini</small></div><div class="inline-stat"><strong>${ranked.reduce((n,p) => n + p.correctCount,0)}</strong><small>Jawaban benar total</small></div><div class="inline-stat"><strong>${ranked[0]?.score || 0}</strong><small>Skor tertinggi</small></div></div>
    <div class="result-list">${ranked.map((p,i) => `<div class="result-row"><div class="result-place">${i+1}</div><div><div class="result-name">${escapeHtml(p.name)} ${p.id===state.selfId ? '<span class="tiny">(Kamu)</span>' : ''}</div><div class="result-sub">${p.correctCount} jawaban benar · waktu menjawab ${shortTime(p.totalAnswerMs)}</div></div><div class="result-value"><strong>${p.score}</strong><small>POIN</small></div></div>`).join('')}</div>
    <div class="notice-bar cyan"><span>✦</span><span>${state.roundIndex === 3 ? 'Siap untuk ronde final Ilmu Ekonomi? Ketiga peserta akan voting rahasia untuk memilih tingkat kesulitan.' : 'Kombinasi kotak berikutnya akan dipilih di ronde selanjutnya.'}</span></div>
    ${isHost ? `<div class="button-row" style="margin-top:18px"><button class="button primary" data-action="next_round">${state.roundIndex === 3 ? 'Lanjut ke Voting Final' : 'Mulai Ronde Berikutnya'} <span>→</span></button></div>` : '<div class="notice-bar"><span>◷</span><span>Menunggu host melanjutkan ke tahap berikutnya.</span></div>'}
  </div>`;
  return gameFrame(main);
}
function renderVotingReady() {
  const main = `<div class="stage-panel"><span class="eyebrow">RONDE FINAL</span><h2>Semua suara menentukan.</h2><p class="lead">Final berisi 10 soal Ilmu Ekonomi tingkat perguruan tinggi. Tiga peserta akan memilih tingkat kesulitan secara bersamaan; pilihan masing-masing dirahasiakan selama voting.</p>
    <div class="inline-stat-row"><div class="inline-stat"><strong>10</strong><small>Soal ekonomi</small></div><div class="inline-stat"><strong>40 dtk</strong><small>Waktu per soal</small></div><div class="inline-stat"><strong>${state.settings.votingSeconds} dtk</strong><small>Durasi voting</small></div></div>
    <div class="vote-grid">${FINAL_DIFFICULTIES.map((d,i) => `<div class="vote-option" style="cursor:default"><span class="vote-symbol">${['◌','◈','◇','✦'][i]}</span><strong>${d.label}</strong><small>${d.points} poin per jawaban benar</small></div>`).join('')}</div>
    ${state.role === 'host' ? `<button class="button primary" data-action="start_voting">Mulai voting final <span>→</span></button>` : `<div class="notice-bar cyan"><span>◷</span><span>Host akan membuka voting. Siapkan pilihanmu.</span></div>`}
  </div>`;
  return gameFrame(main);
}
function renderVoting() {
  const isHost = state.role === 'host';
  const selected = state.voting.ownVote;
  const options = FINAL_DIFFICULTIES.map((d,i) => `<button type="button" class="vote-option ${selected === d.id ? 'selected' : ''}" data-action="vote" data-difficulty="${d.id}" ${isHost || state.voting.hasVoted ? 'disabled' : ''}><span class="vote-symbol">${['◌','◈','◇','✦'][i]}</span><strong>${d.label}</strong><small>${d.points} poin per jawaban benar</small></button>`).join('');
  const remaining = Math.max(0, (state.voting.deadlineAt || currentServerNow()) - currentServerNow());
  const main = `<div class="stage-panel"><span class="eyebrow">VOTING RAHASIA</span><h2>Pilih tingkat kesulitan.</h2><p class="muted small">Setiap peserta punya satu suara. Peserta lain tidak dapat melihat pilihanmu sebelum voting berakhir.</p>
    <div class="question-footer" style="padding:0 0 15px;margin:15px 0 0;border:0"><div>${timerWidget('vote', state.voting.deadlineAt, remaining, (state.settings.votingSeconds || 30)*1000, false)}</div><span class="pill"><i class="dot" style="background:var(--purple)"></i>${state.voting.hasVoted ? 'Suara terkunci' : 'Menunggu pilihanmu'}</span></div>
    <div class="vote-grid">${options}</div>
    ${state.voting.hasVoted ? `<div class="notice-bar cyan"><span>✓</span><span>Suaramu sudah terkunci: <strong>${escapeHtml(labelForDifficulty(selected))}</strong>. Pilihan peserta lain belum ditampilkan.</span></div>` : !isHost ? '<div class="notice-bar"><span>ⓘ</span><span>Kamu hanya dapat memberikan satu suara. Pilih dengan cermat!</span></div>' : '<div class="notice-bar cyan"><span>◎</span><span>Dashboard host menampilkan identitas peserta dan pilihan mereka secara langsung.</span></div>'}
    ${isHost ? `<div class="button-row" style="margin-top:16px"><button class="button outline" data-action="end_voting">Akhiri voting sekarang</button></div>` : ''}
  </div>`;
  let extra = '';
  if (isHost) {
    extra = `<div class="host-section"><div class="sidebar-title"><span class="mini-dot"></span> DETAIL VOTING (HOST)</div>${(state.hostData?.votes || []).map((v) => `<div class="participant-mini"><div><div class="mini-name">${escapeHtml(v.name)}</div><div class="mini-meta">${v.connected ? 'Online' : 'Offline'}</div></div><span class="answer-status ${v.submitted ? 'ok' : ''}">${v.submitted ? escapeHtml(v.voteLabel) : 'Belum memilih'}</span></div>`).join('')}</div>`;
  }
  return gameFrame(main, extra);
}
function renderVotingTie() {
  const isHost = state.role === 'host';
  const options = (state.voting.tieOptions || []).map((id) => DIFFICULTIES.find((d) => d.id === id)).filter(Boolean);
  const tally = state.voting.tally || {};
  const main = `<div class="stage-panel"><span class="eyebrow">HASIL VOTING</span><h2>${options.length === 4 ? 'Belum ada suara masuk.' : 'Voting berakhir seri.'}</h2><p class="muted small">${options.length === 4 ? 'Karena tidak ada suara yang masuk, host harus memilih tingkat kesulitan final.' : 'Host akan memecahkan seri di antara pilihan teratas. Hasil suara kini terlihat untuk semua pemain.'}</p>
    <div class="result-list" style="margin-top:20px">${FINAL_DIFFICULTIES.map((d) => `<div class="result-row"><div class="result-place">${tally[d.id] || 0}</div><div><div class="result-name">${d.label}</div><div class="result-sub">${d.points} poin per jawaban benar</div></div><div class="result-value"><small>${options.some((x) => x.id === d.id) ? 'PILIHAN SERI' : ''}</small></div></div>`).join('')}</div>
    ${isHost ? `<div class="host-section"><div class="field"><label for="tie-difficulty">Pilih kesulitan final</label><select class="input" id="tie-difficulty">${options.map((d) => `<option value="${d.id}">${d.label}</option>`).join('')}</select></div><button class="button primary" data-action="resolve-vote-tie">Konfirmasi pilihan host <span>→</span></button></div>` : '<div class="notice-bar"><span>◷</span><span>Menunggu host menetapkan pilihan pemecah seri.</span></div>'}
  </div>`;
  return gameFrame(main);
}
function renderTiebreakReady() {
  return renderQuestionReady();
}
function renderTiebreakActive() {
  return renderQuestionActive();
}
function renderTiebreakReview() {
  return renderReview();
}
function podiumCard(r, cls, emoji) {
  if (!r) return `<div class="podium-place ${cls}"><div class="podium-avatar">—</div><div class="podium-name">Menunggu</div><div class="podium-score">—</div><div class="podium-base">—</div></div>`;
  return `<div class="podium-place ${cls}"><div class="podium-crown">${emoji}</div><div class="podium-avatar">${escapeHtml(initials(r.name))}</div><div class="podium-name">${escapeHtml(r.name)}</div><div class="podium-score">${r.score} poin</div><div class="podium-base">${r.place === 1 ? 'JUARA 1' : r.place === 2 ? 'JUARA 2' : 'JUARA 3'}</div></div>`;
}
function renderResults() {
  const ranking = state.rankings || [];
  const second = ranking.find((r) => r.place === 2);
  const first = ranking.find((r) => r.place === 1);
  const third = ranking.find((r) => r.place === 3);
  const isHost = state.role === 'host';
  const penalties = state.punishments || [];
  const myPunishment = state.ownPunishment;
  const canSkip = !isHost && myPunishment && !state.ownSkippedPunishment;
  const main = `<div class="stage-panel"><div style="text-align:center"><span class="eyebrow" style="justify-content:center">PERTANDINGAN SELESAI</span><h2 style="font-size:clamp(32px,5vw,48px);margin-top:14px">Kita punya <span class="gradient-text">juara!</span></h2><p class="muted small">Lima ronde, lima puluh soal. Selamat untuk semua pemain yang sudah bertanding.</p></div>
    <div class="podium">${podiumCard(second,'second','🥈')}${podiumCard(first,'first','👑')}${podiumCard(third,'third','🥉')}</div>
    <div class="result-list">${ranking.map((r) => `<div class="result-row"><div class="result-place">${r.place}</div><div><div class="result-name">${escapeHtml(r.name)} ${r.playerId === state.selfId ? '<span class="tiny">(Kamu)</span>' : ''}</div><div class="result-sub">${r.correctCount} jawaban benar · waktu ${shortTime(r.totalAnswerMs)}</div></div><div class="result-value"><strong>${r.score}</strong><small>POIN</small></div></div>`).join('')}</div>
    <div class="host-section"><div class="sidebar-title"><span class="mini-dot" style="background:var(--gold)"></span> TANTANGAN PODIUM</div>
      ${penalties.filter((r) => r.punishment).map((r) => `<div class="result-row penalty-row" style="margin-bottom:8px"><div class="result-place">${r.place}</div><div><div class="result-name">${escapeHtml(r.name)}</div><div class="result-sub">${escapeHtml(r.punishment.text)}</div></div><div class="result-value"><small>${r.skipped ? 'DILEWATI' : r.place === 2 ? 'JUARA 2' : 'JUARA 3'}</small></div></div>`).join('')}
      ${myPunishment ? `<div class="notice-bar ${state.ownSkippedPunishment ? 'cyan' : ''}"><span>◎</span><span>${state.ownSkippedPunishment ? 'Kamu memilih melewati tantangan. Pilihanmu dihormati.' : `Tantanganmu: ${escapeHtml(myPunishment.text)}. Semua tantangan bersifat ringan dan boleh dilewati jika tidak nyaman.`}</span></div>` : ''}
      ${canSkip ? `<button class="button outline" style="margin-top:12px" data-action="skip-punishment">Lewati tantangan saya</button>` : ''}
    </div>
    ${isHost ? `<div class="button-row" style="justify-content:center;margin-top:24px"><button class="button primary" data-action="restart_session">Main lagi dengan room yang sama ↻</button><button class="button outline" data-action="end_room">Tutup room</button></div>` : `<div class="notice-bar cyan"><span>✦</span><span>Terima kasih sudah bermain. Host dapat memulai sesi baru menggunakan room ini.</span></div>`}
  </div>`;
  return gameFrame(main);
}
function renderDisconnected() {
  return `<section class="screen"><div class="panel" style="max-width:590px;margin:5vh auto;text-align:center;padding:38px"><div class="panel-icon cyan" style="margin:0 auto 18px;font-size:24px">⌁</div><h2>Koneksi terputus.</h2><p class="muted small">Progress sesi dipertahankan server. Periksa koneksi internet; aplikasi akan mencoba menyambung kembali secara otomatis.</p><div class="spinner" style="margin:20px auto"></div><button class="button outline" data-action="home">Kembali ke halaman awal</button></div></section>`;
}
function render() {
  if (!state) { renderHome(); return; }
  switch (state.phase) {
    case 'lobby': app.innerHTML = renderLobby(); break;
    case 'rules': app.innerHTML = renderRules(); break;
    case 'selection': app.innerHTML = renderSelection(); break;
    case 'question_ready': app.innerHTML = renderQuestionReady(); break;
    case 'question_active': app.innerHTML = renderQuestionActive(); break;
    case 'review': app.innerHTML = renderReview(); break;
    case 'round_score': app.innerHTML = renderRoundScore(); break;
    case 'voting_ready': app.innerHTML = renderVotingReady(); break;
    case 'voting': app.innerHTML = renderVoting(); break;
    case 'voting_tiebreak': app.innerHTML = renderVotingTie(); break;
    case 'tiebreak_ready': app.innerHTML = renderTiebreakReady(); break;
    case 'tiebreak_active': app.innerHTML = renderTiebreakActive(); break;
    case 'tiebreak_review': app.innerHTML = renderTiebreakReview(); break;
    case 'results': app.innerHTML = renderResults(); break;
    default: app.innerHTML = renderHome();
  }
}

socket.on('connect', () => {
  setConnection('online', 'Terhubung');
  if (session?.roomCode && session?.token) {
    socket.emit('rejoin', { roomCode: session.roomCode, token: session.token, name: session.name });
  }
});
socket.on('disconnect', () => {
  setConnection('offline', 'Menyambung ulang');
  if (state) {
    app.innerHTML = renderDisconnected();
  }
});
socket.on('connect_error', () => setConnection('offline', 'Koneksi bermasalah'));
socket.on('joined', (payload) => {
  saveSession({ roomCode: payload.roomCode, token: payload.token, name: payload.name, role: payload.role });
  reconnectNoticeSeen = true;
});
socket.on('state', (nextState) => {
  serverOffset = Number(nextState.serverNow || Date.now()) - Date.now();
  const signature = `${nextState.phase}-${nextState.questionNumber}-${nextState.roundIndex}-${nextState.players?.map((p) => `${p.id}:${p.score}:${p.hasAnswered}`).join(',')}`;
  if (lastStateSignature && signature !== lastStateSignature && soundEnabled) {
    if (nextState.phase === 'review' || nextState.phase === 'tiebreak_review' || nextState.phase === 'results') playTone(nextState.phase === 'results' ? 880 : 610, .1);
  }
  lastStateSignature = signature;
  state = nextState;
  setConnection('online', 'Terhubung');
  render();
});
socket.on('notice', (payload) => toast(payload.message || 'Ada pembaruan.', payload.kind || 'info'));
socket.on('room_closed', (payload) => {
  saveSession(null); state = null; lastStateSignature = ''; render(); toast(payload.message || 'Room ditutup.', 'warning');
});

app.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.id === 'create-form') {
    event.preventDefault();
    const fd = new FormData(form);
    const settings = {
      votingSeconds: Number(fd.get('votingSeconds') || 30),
      penalties: fd.getAll('penalty'),
      randomPunishments: fd.get('randomPunishments') === 'on',
    };
    if (!settings.penalties.length) settings.penalties = PUNISHMENTS.slice(0,2);
    socket.emit('create_room', { name: fd.get('name'), settings });
    return;
  }
  if (form.id === 'join-form') {
    event.preventDefault();
    const fd = new FormData(form);
    socket.emit('join_room', { name: fd.get('name'), roomCode: String(fd.get('roomCode') || '').trim().toUpperCase() });
    return;
  }
  if (form.id === 'lobby-settings') {
    event.preventDefault();
    if (state?.role !== 'host') return;
    const fd = new FormData(form);
    let penalties = fd.getAll('penalty');
    if (!penalties.length) { toast('Pilih setidaknya satu tantangan.', 'warning'); return; }
    hostAction('update_settings', { settings: { penalties, randomPunishments: fd.get('randomPunishments') === 'on', votingSeconds: Number(fd.get('votingSeconds') || 30) } });
  }
  if (form.id === 'question-edit-form') {
    event.preventDefault();
    if (state?.role !== 'host') return;
    const fd = new FormData(form);
    hostAction('edit_question', {
      mode: form.dataset.mode || 'current',
      question: fd.get('question'),
      options: [fd.get('option0'), fd.get('option1'), fd.get('option2'), fd.get('option3')],
      answer: Number(fd.get('answer')),
      explanation: fd.get('explanation'),
    });
  }
});

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  switch (action) {
    case 'toggle-ready': socket.emit('toggle_ready'); break;
    case 'ack-rules': socket.emit('ack_rules'); break;
    case 'begin_rules': hostAction('begin_rules'); break;
    case 'start_game': hostAction('start_game'); break;
    case 'select-box':
      if (target.dataset.boxId) {
        if (state?.role === 'host') hostAction('open_box', { boxId: target.dataset.boxId });
        else socket.emit('select_box', { boxId: target.dataset.boxId });
      }
      break;
    case 'start_question': hostAction('start_question'); break;
    case 'pause_timer': hostAction('pause_timer'); break;
    case 'resume_timer': hostAction('resume_timer'); break;
    case 'end_question': hostAction('end_question'); break;
    case 'end_round': hostAction('end_round'); break;
    case 'next_question': hostAction('next_question'); break;
    case 'next_round': hostAction('next_round'); break;
    case 'start_voting': hostAction('start_voting'); break;
    case 'end_voting': hostAction('end_voting'); break;
    case 'vote': socket.emit('cast_vote', { difficulty: target.dataset.difficulty }); break;
    case 'resolve-vote-tie': {
      const input = document.getElementById('tie-difficulty');
      if (input) hostAction('resolve_vote_tie', { difficulty: input.value });
      break;
    }
    case 'replace-subject': {
      const input = document.getElementById('replacement-subject');
      if (input) hostAction('replace_subject', { subject: input.value });
      break;
    }
    case 'finish_tiebreak': hostAction('finish_tiebreak'); break;
    case 'answer': {
      const choice = Number(target.dataset.choice);
      if (Number.isInteger(choice)) {
        socket.emit('submit_answer', { choice });
        playTone(520 + choice * 70, .06);
      }
      break;
    }
    case 'skip-punishment': socket.emit('skip_punishment'); break;
    case 'restart_session': if (window.confirm('Reset sesi untuk semua pemain? Seluruh progres dan skor pertandingan akan dihapus.')) hostAction('restart_session'); break;
    case 'end_room': if (window.confirm('Tutup room ini untuk semua pemain?')) hostAction('end_room'); break;
    case 'copy-room':
      copyText(state?.roomCode || '').then(() => toast('Kode room disalin.', 'success')).catch(() => toast(`Kode room: ${state?.roomCode || ''}`, 'info'));
      break;
    case 'copy-link': {
      const input = document.getElementById('invite-link');
      copyText(input?.value || '').then(() => toast('Tautan undangan disalin.', 'success')).catch(() => toast(input?.value || 'Tautan tidak tersedia.', 'info'));
      break;
    }
    case 'home': saveSession(null); state = null; socket.disconnect(); socket.connect(); render(); break;
    default: break;
  }
});
async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const temp = document.createElement('textarea'); temp.value = value; temp.style.position='fixed'; temp.style.opacity='0'; document.body.appendChild(temp); temp.select();
  const ok = document.execCommand('copy'); temp.remove(); if (!ok) throw new Error('copy failed');
}
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-icon').textContent = soundEnabled ? '♫' : '♪̸';
  soundToggle.setAttribute('aria-label', soundEnabled ? 'Matikan efek suara' : 'Aktifkan efek suara');
  toast(soundEnabled ? 'Efek suara aktif.' : 'Efek suara dimatikan.', 'info');
});
document.getElementById('brand-link').addEventListener('click', (event) => {
  if (!state) return;
  event.preventDefault();
  toast('Kamu sedang berada di room aktif. Gunakan kontrol room untuk melanjutkan.', 'warning');
});

setInterval(() => {
  if (!state) return;
  const now = currentServerNow();
  let remaining = 0; let duration = 40000; let type = 'question';
  if (state.phase === 'question_active' || state.phase === 'tiebreak_active') {
    remaining = state.timerPaused ? state.remainingMs : state.questionDeadlineAt ? Math.max(0, state.questionDeadlineAt - now) : state.remainingMs;
    duration = 40000;
  } else if (state.phase === 'voting') {
    remaining = state.voting.deadlineAt ? Math.max(0, state.voting.deadlineAt - now) : 0;
    duration = (state.settings.votingSeconds || 30) * 1000; type = 'vote';
  } else if (state.phase === 'review') {
    remaining = Math.max(0, (state.reviewReadyAt || now) - now); duration = 8000; type = 'review';
  } else if (state.phase === 'tiebreak_review') {
    remaining = Math.max(0, (state.reviewReadyAt || now) - now); duration = 8000; type = 'review';
  }
  const clock = document.querySelector(`[data-clock="${type}"]`);
  if (clock) clock.textContent = formatTime(remaining);
  const ring = document.querySelector(`[data-ring="${type}"]`);
  if (ring) ring.style.setProperty('--timer-pct', `${Math.max(0, Math.min(100, remaining / duration * 100))}%`);
  const bar = document.querySelector(`[data-progress="${type}"]`);
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, remaining / duration * 100))}%`;
  const caption = document.querySelector(`[data-timer-caption="${type}"]`);
  if (caption) {
    if (type === 'review') caption.textContent = remaining > 0 ? `Tombol aktif dalam ${Math.ceil(remaining/1000)} detik` : 'Pembahasan siap dilanjutkan';
    else caption.textContent = state.timerPaused ? 'Menunggu host melanjutkan' : `${Math.ceil(remaining/1000)} detik tersisa`;
  }
  document.querySelectorAll('[data-unlock-at]').forEach((button) => {
    const unlockAt = Number(button.dataset.unlockAt || 0);
    button.disabled = now < unlockAt;
  });
}, 200);

render();
