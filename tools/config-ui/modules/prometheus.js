'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const DATA_DIR = process.env.PROMETHEUS_DATA_DIR || '/data';
const SETTINGS_FILE = path.join(DATA_DIR, 'prometheus-settings.json');
const PROMETHEUS_CONFIG_PATH = process.env.PROMETHEUS_CONFIG_PATH || '/etc/prometheus/prometheus.yml';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';

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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadSettings() {
  const defaults = {
    scrapeInterval: process.env.PROMETHEUS_SCRAPE_INTERVAL || '10s',
    evaluationInterval: process.env.PROMETHEUS_EVALUATION_INTERVAL || '15s',
    retentionTime: process.env.PROMETHEUS_RETENTION_TIME || '30d',
    attraccessTarget: process.env.PROMETHEUS_ATTRACCESS_TARGET || 'attraccess:3000',
    metricsApiKey: process.env.PROMETHEUS_METRICS_API_KEY || '',
  };
  const stored = loadJson(SETTINGS_FILE, null);
  return stored || defaults;
}

function saveSettings(settings) {
  saveJson(SETTINGS_FILE, settings);
}

function sanitizeYamlValue(value) {
  return String(value).replace(/['\n\r\\]/g, '');
}

function generatePrometheusConfig(settings) {
  const lines = [
    'global:',
    `  scrape_interval: ${sanitizeYamlValue(settings.scrapeInterval || '15s')}`,
    `  evaluation_interval: ${sanitizeYamlValue(settings.evaluationInterval || '15s')}`,
    '',
    'rule_files:',
    "  - '/etc/prometheus/alerts.yml'",
    '',
    'scrape_configs:',
    "  - job_name: 'attraccess'",
    "    metrics_path: '/api/metrics'",
    '    static_configs:',
    `      - targets: ['${sanitizeYamlValue(settings.attraccessTarget || 'attraccess:3000')}']`,
    `    scrape_interval: ${sanitizeYamlValue(settings.scrapeInterval || '10s')}`,
  ];

  if (settings.metricsApiKey) {
    lines.push(`    bearer_token: '${sanitizeYamlValue(settings.metricsApiKey)}'`);
  }

  return lines.join('\n') + '\n';
}

function writePrometheusConfig(settings) {
  try {
    fs.mkdirSync(path.dirname(PROMETHEUS_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(PROMETHEUS_CONFIG_PATH, generatePrometheusConfig(settings), 'utf-8');
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

const prometheusModule = {
  id: 'prometheus',
  label: 'Prometheus',

  init() {
    const settings = loadSettings();
    writePrometheusConfig(settings);
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
      const settings = loadSettings();
      helpers.sendJson(res, 200, settings);
      return true;
    }

    if (method === 'PUT' && subPath === '/settings') {
      const body = await helpers.readBody(req);
      const settings = loadSettings();
      if (body.scrapeInterval !== undefined) settings.scrapeInterval = body.scrapeInterval;
      if (body.evaluationInterval !== undefined) settings.evaluationInterval = body.evaluationInterval;
      if (body.retentionTime !== undefined) settings.retentionTime = body.retentionTime;
      if (body.attraccessTarget !== undefined) settings.attraccessTarget = body.attraccessTarget;
      if (body.metricsApiKey !== undefined) settings.metricsApiKey = body.metricsApiKey;
      saveSettings(settings);
      writePrometheusConfig(settings);
      reloadPrometheus();
      helpers.sendJson(res, 200, settings);
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
