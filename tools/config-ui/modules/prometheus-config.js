'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.PROMETHEUS_DATA_DIR || '/data';

const SETTINGS_FILE = path.join(DATA_DIR, 'prometheus-settings.json');

const PROMETHEUS_CONFIG_PATH = process.env.PROMETHEUS_CONFIG_PATH || '/etc/prometheus/prometheus.yml';

const PRIVATE_FILE_MODE = 0o600;

const SHARED_FILE_MODE = 0o644;

function log(message) {
  console.log(`[prometheus] ${message}`);
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: PRIVATE_FILE_MODE });
  try {
    fs.chmodSync(filePath, PRIVATE_FILE_MODE);
  } catch {
    // best-effort: tmpfs/volume may not support chmod
  }
}

function loadNonSecretDefaults() {
  return {
    scrapeInterval: process.env.PROMETHEUS_SCRAPE_INTERVAL || '10s',
    evaluationInterval: process.env.PROMETHEUS_EVALUATION_INTERVAL || '15s',
    attraccessTarget: process.env.PROMETHEUS_ATTRACCESS_TARGET || 'attraccess:3000',
  };
}

function loadSettings() {
  const stored = loadJson(SETTINGS_FILE, null);
  return stored || loadNonSecretDefaults();
}

function saveSettings(settings) {
  const { scrapeInterval, evaluationInterval, attraccessTarget } = settings;
  saveJson(SETTINGS_FILE, { scrapeInterval, evaluationInterval, attraccessTarget });
}

function sanitizeYamlValue(value) {
  return String(value).replace(/['\n\r\\]/g, '');
}

function readApiKeyFromConfig() {
  try {
    const content = fs.readFileSync(PROMETHEUS_CONFIG_PATH, 'utf-8');
    const match = content.match(/bearer_token:\s*'([^']*)'/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function resolveApiKey(bodyValue) {
  if (typeof bodyValue === 'string' && bodyValue.length > 0) return bodyValue;
  const envKey = process.env.PROMETHEUS_METRICS_API_KEY;
  if (typeof envKey === 'string' && envKey.length > 0) return envKey;
  return readApiKeyFromConfig();
}

function generatePrometheusConfig(settings, apiKey) {
  const lines = [
    'global:',
    `  scrape_interval: ${sanitizeYamlValue(settings.scrapeInterval || '15s')}`,
    `  evaluation_interval: ${sanitizeYamlValue(settings.evaluationInterval || '15s')}`,
    '',
    'scrape_configs:',
    "  - job_name: 'attraccess'",
    "    metrics_path: '/api/metrics'",
    '    static_configs:',
    `      - targets: ['${sanitizeYamlValue(settings.attraccessTarget || 'attraccess:3000')}']`,
    `    scrape_interval: ${sanitizeYamlValue(settings.scrapeInterval || '10s')}`,
  ];

  if (apiKey) {
    lines.push(`    bearer_token: '${sanitizeYamlValue(apiKey)}'`);
  }

  lines.push(
    '',
    "  - job_name: 'node-exporter'",
    '    static_configs:',
    "      - targets: ['node-exporter:9100']",
    '    scrape_interval: 15s',
    '',
    "  - job_name: 'cadvisor'",
    '    static_configs:',
    "      - targets: ['cadvisor:8080']",
    '    scrape_interval: 15s',
  );

  return lines.join('\n') + '\n';
}

function writePrometheusConfig(settings, apiKey) {
  try {
    fs.mkdirSync(path.dirname(PROMETHEUS_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(PROMETHEUS_CONFIG_PATH, generatePrometheusConfig(settings, apiKey), {
      encoding: 'utf-8',
      mode: SHARED_FILE_MODE,
    });
    try {
      fs.chmodSync(PROMETHEUS_CONFIG_PATH, SHARED_FILE_MODE);
    } catch {
      // best-effort
    }
    log('wrote prometheus.yml');
    return true;
  } catch (err) {
    log(`failed to write config: ${err.message}`);
    return false;
  }
}

function getCurrentConfig() {
  try {
    return fs.readFileSync(PROMETHEUS_CONFIG_PATH, 'utf-8');
  } catch {
    return null;
  }
}

function publicSettings(settings) {
  return {
    scrapeInterval: settings.scrapeInterval,
    evaluationInterval: settings.evaluationInterval,
    attraccessTarget: settings.attraccessTarget,
    apiKeyConfigured: Boolean(readApiKeyFromConfig()),
  };
}
module.exports = {
  DATA_DIR,
  SETTINGS_FILE,
  PROMETHEUS_CONFIG_PATH,
  PRIVATE_FILE_MODE,
  SHARED_FILE_MODE,
  log,
  loadJson,
  saveJson,
  loadNonSecretDefaults,
  loadSettings,
  saveSettings,
  sanitizeYamlValue,
  readApiKeyFromConfig,
  resolveApiKey,
  generatePrometheusConfig,
  writePrometheusConfig,
  getCurrentConfig,
  publicSettings,
};
