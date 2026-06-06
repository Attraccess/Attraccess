'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const DATA_DIR = process.env.PROMETHEUS_DATA_DIR || '/data';
const SETTINGS_FILE = path.join(DATA_DIR, 'prometheus-settings.json');
const PROMETHEUS_CONFIG_PATH = process.env.PROMETHEUS_CONFIG_PATH || '/etc/prometheus/prometheus.yml';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';

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

  return lines.join('\n') + '\n';
}

function writePrometheusConfig(settings, apiKey) {
  try {
    fs.mkdirSync(path.dirname(PROMETHEUS_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(
      PROMETHEUS_CONFIG_PATH,
      generatePrometheusConfig(settings, apiKey),
      { encoding: 'utf-8', mode: SHARED_FILE_MODE },
    );
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

function reloadPrometheus() {
  const url = `${PROMETHEUS_URL}/-/reload`;
  const parsed = new URL(url);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || 9090,
    path: parsed.pathname,
    method: 'POST',
    timeout: 5000,
  };
  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      log('reloaded via /-/reload');
    } else {
      log(`reload returned status ${res.statusCode}`);
    }
    res.resume();
  });
  req.on('error', (err) => {
    log(`reload failed: ${err.message}`);
  });
  req.end();
}

function getPrometheusStatus() {
  return new Promise((resolve) => {
    const url = `${PROMETHEUS_URL}/-/ready`;
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 9090,
      path: parsed.pathname,
      method: 'GET',
      timeout: 3000,
    };
    const req = http.request(options, (res) => {
      res.resume();
      resolve({ running: res.statusCode === 200, url: PROMETHEUS_URL });
    });
    req.on('error', () => resolve({ running: false, url: PROMETHEUS_URL }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false, url: PROMETHEUS_URL }); });
    req.end();
  });
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

const prometheusModule = {
  id: 'prometheus',
  label: 'Prometheus',

  init() {
    const settings = loadSettings();
    const apiKey = resolveApiKey();
    writePrometheusConfig(settings, apiKey);
    log('initialized');
  },

  shutdown() {},

  async handleRequest(method, subPath, subParts, req, res, helpers) {
    if (method === 'GET' && subPath === '/status') {
      const status = await getPrometheusStatus();
      helpers.sendJson(res, 200, status);
      return true;
    }

    if (method === 'GET' && subPath === '/settings') {
      helpers.sendJson(res, 200, publicSettings(loadSettings()));
      return true;
    }

    if (method === 'PUT' && subPath === '/settings') {
      const body = await helpers.readBody(req);
      const settings = loadSettings();
      if (body.scrapeInterval !== undefined) settings.scrapeInterval = body.scrapeInterval;
      if (body.evaluationInterval !== undefined) settings.evaluationInterval = body.evaluationInterval;
      if (body.attraccessTarget !== undefined) settings.attraccessTarget = body.attraccessTarget;
      saveSettings(settings);
      const apiKey = resolveApiKey(body.metricsApiKey);
      writePrometheusConfig(settings, apiKey);
      reloadPrometheus();
      helpers.sendJson(res, 200, publicSettings(settings));
      return true;
    }

    if (method === 'DELETE' && subPath === '/api-key') {
      const settings = loadSettings();
      writePrometheusConfig(settings, '');
      reloadPrometheus();
      helpers.sendJson(res, 200, publicSettings(settings));
      return true;
    }

    if (method === 'GET' && subPath === '/config') {
      const config = getCurrentConfig();
      if (config === null) {
        helpers.sendJson(res, 404, { error: 'config file not found' });
      } else {
        helpers.sendJson(res, 200, { config });
      }
      return true;
    }

    return false;
  },
};

module.exports = prometheusModule;
