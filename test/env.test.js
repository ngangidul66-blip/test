'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadEnvFile } = require('../env');

test('pemuatan .env dapat mendeteksi file yang dibuat setelah server mulai dan memperbarui nilainya', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-env-'));
  const envFile = path.join(dir, '.env');
  const env = {};
  try {
    assert.doesNotThrow(() => loadEnvFile(envFile, env));
    fs.writeFileSync(envFile, 'GEMINI_API_KEY=key-lama\nGEMINI_MODEL=gemini-2.5-flash\n');
    loadEnvFile(envFile, env);
    assert.equal(env.GEMINI_API_KEY, 'key-lama');
    fs.writeFileSync(envFile, 'GEMINI_API_KEY=key-baru\nGEMINI_MODEL=gemini-2.5-flash\n');
    loadEnvFile(envFile, env);
    assert.equal(env.GEMINI_API_KEY, 'key-baru');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nilai environment dari hosting tidak ditimpa oleh file .env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-env-'));
  const envFile = path.join(dir, '.env');
  const env = { GEMINI_API_KEY: 'key-dari-hosting' };
  try {
    fs.writeFileSync(envFile, 'GEMINI_API_KEY=key-dari-file\n');
    loadEnvFile(envFile, env);
    assert.equal(env.GEMINI_API_KEY, 'key-dari-hosting');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
