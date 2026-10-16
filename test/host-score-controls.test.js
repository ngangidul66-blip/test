'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

test('pengurangan poin hanya tersedia melalui aksi host, dibatasi pada peserta dan nominal yang diizinkan', () => {
  assert.match(server, /function handleHostAction\(room, host, action, data = \{\}\)/);
  assert.match(server, /if \(host\.role !== 'host'\) return \{ ok: false, message: 'Hanya host yang dapat memakai kontrol ini\.' \}/);
  assert.match(server, /case 'deduct_points'/);
  assert.match(server, /participants\(room\)\.find\(\(p\) => p\.id === String\(data\.playerId \|\| ''\)\)/);
  assert.match(server, /\[5, 10, 20, 30\]\.includes\(amount\)/);
  assert.match(server, /target\.score = Math\.max\(0, before - amount\)/);
  assert.match(server, /audit\(room, host\.id, 'Mengurangi poin peserta'/);
});

test('dashboard host memiliki tombol pengurangan poin dan konfirmasi sebelum aksi', () => {
  assert.match(app, /KURANGI POIN/);
  assert.match(app, /data-action="deduct-points"/);
  assert.match(app, /data-amount="5"/);
  assert.match(app, /data-amount="10"/);
  assert.match(app, /data-amount="20"/);
  assert.match(app, /window\.confirm\(`Kurangi \$\{amount\} poin dari \$\{player\.name\}/);
  assert.match(css, /\.host-score-control/);
  assert.match(css, /\.score-adjust-buttons/);
});

test('roulette menggunakan tujuh hukuman yang dipilih pengguna dan menunggu putaran host', () => {
  for (const text of ['Konser dadakan', 'Joget kemenangan', 'Tirukan hewan', 'Ekspresi teraneh', 'Next jadi Host', 'Roll depan', 'Push-up 20x']) {
    assert.ok(server.includes(text), `server harus memuat hukuman: ${text}`);
    assert.ok(app.includes(text), `dashboard harus menampilkan hukuman: ${text}`);
  }
  assert.match(server, /function assignPunishments\(room\)[\s\S]*?text: null[\s\S]*?spun: false/);
  assert.match(server, /case 'spin_punishment'/);
  assert.match(server, /crypto\.randomInt\(0, list\.length\)/);
  assert.match(server, /setTimeout\(\(\) => \{[\s\S]*?Roulette hukuman selesai[\s\S]*?\}, 3600\)/);
  assert.match(app, /HUKUMAN JUARA 2 &amp; 3/);
  assert.match(app, /data-action="spin-punishment"/);
  assert.match(app, /punishment-wheel/);
  assert.match(css, /\.punishment-wheel\.is-spinning/);
  assert.match(app, /data-action="skip-punishment"/);
});

test('hasil Next jadi Host mengalihkan peran host ketika sesi berikutnya dimulai', () => {
  assert.match(server, /item\.text\?\.startsWith\('Next jadi Host'\)/);
  assert.match(server, /previousHost\.role = 'participant'/);
  assert.match(server, /nextHost\.role = 'host'/);
});
