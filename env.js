'use strict';

const fs = require('fs');
const path = require('path');

// Track variables loaded from a local .env so edits made while the server is
// running can be picked up on the next retry. Environment variables injected
// by the hosting platform retain priority over values from .env.
const loadedFromFiles = new WeakMap();

function loadEnvFile(filePath = path.join(__dirname, '.env'), target = process.env) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return target;
    throw error;
  }

  let ownedKeys = loadedFromFiles.get(target);
  if (!ownedKeys) {
    ownedKeys = new Set();
    loadedFromFiles.set(target, ownedKeys);
  }

  for (const line of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    // Refresh values previously sourced from this file; don't override a real
    // environment variable injected by a hosting platform.
    if (!Object.hasOwn(target, key) || !target[key] || ownedKeys.has(key)) {
      target[key] = value;
      ownedKeys.add(key);
    }
  }
  return target;
}

function getGeminiConfig() {
  loadEnvFile();
  let apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
  if (/^(isi_kunci_api_di_sini|masukkan_api_key_di_sini|your_api_key_here|replace_me)$/i.test(apiKey)) apiKey = '';
  return { apiKey, model };
}

module.exports = { loadEnvFile, getGeminiConfig };
