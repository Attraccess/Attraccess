'use strict';
const {
  log,
  loadSettings,
  resolveApiKey,
  writePrometheusConfig,
  replacePrometheusConfig,
  publicSettings,
  saveSettings,
  getCurrentConfig,
} = require('./prometheus-config.js');

const http = require('http');
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';

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
    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false, url: PROMETHEUS_URL });
    });
    req.end();
  });
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

  shutdown() {
    /* Prometheus is managed externally. */
  },

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
      const apiKey = resolveApiKey(body.metricsApiKey);
      const previousConfig = getCurrentConfig();
      if (!writePrometheusConfig(settings, apiKey)) {
        helpers.sendJson(res, 500, { error: 'Failed to write Prometheus configuration. Settings were not saved.' });
        return true;
      }
      try {
        saveSettings(settings);
      } catch (error) {
        log(`failed to save settings: ${error.message}`);
        const restored = replacePrometheusConfig(previousConfig);
        helpers.sendJson(res, 500, {
          error: restored
            ? 'Failed to save Prometheus settings. Previous configuration restored.'
            : 'Failed to save Prometheus settings and restore the configuration. Check storage before retrying.',
        });
        return true;
      }
      reloadPrometheus();
      helpers.sendJson(res, 200, publicSettings(settings));
      return true;
    }

    if (method === 'DELETE' && subPath === '/api-key') {
      const settings = loadSettings();
      if (!writePrometheusConfig(settings, '')) {
        helpers.sendJson(res, 500, { error: 'Failed to write Prometheus configuration. API key was not removed.' });
        return true;
      }
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
