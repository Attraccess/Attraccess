'use strict';

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[hetzner] ${message}`);
}

function getEnvBoolean(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function getEnvNumber(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

function requireEnv(name) {
  const value = process.env[name];
  if (value == null || value === '') {
    throw new Error(`missing required env var: ${name}`);
  }
  return value;
}
module.exports = { log, getEnvBoolean, getEnvNumber, requireEnv };
