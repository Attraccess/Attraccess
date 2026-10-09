/* eslint-disable @typescript-eslint/no-unused-vars -- Public handlers are called by HTML and sibling scripts. */
function loadPromSettings() {
  request('GET', '/api/modules/prometheus/settings').then(function (s) {
    document.getElementById('prom-scrapeInterval').value = s.scrapeInterval || '';
    document.getElementById('prom-evaluationInterval').value = s.evaluationInterval || '';
    document.getElementById('prom-attraccessTarget').value = s.attraccessTarget || '';
    document.getElementById('prom-metricsApiKey').value = '';
    const statusEl = document.getElementById('prom-metricsApiKey-status');
    statusEl.textContent = s.apiKeyConfigured
      ? 'An API key is currently configured. Paste a new one here to rotate it, or leave this empty to keep it.'
      : 'No API key configured. Generate one in Attraccess Settings > Metrics and paste it here.';
  });
}

function savePromSettings() {
  const keyInput = document.getElementById('prom-metricsApiKey').value.trim();
  const data = {
    scrapeInterval: document.getElementById('prom-scrapeInterval').value.trim(),
    evaluationInterval: document.getElementById('prom-evaluationInterval').value.trim(),
    attraccessTarget: document.getElementById('prom-attraccessTarget').value.trim(),
  };
  if (keyInput.length > 0) data.metricsApiKey = keyInput;
  request('PUT', '/api/modules/prometheus/settings', data)
    .then(function () {
      loadPromSettings();
      loadPromConfig();
    })
    .catch(function (error) {
      alert(error.message);
    });
}

function clearPromApiKey() {
  if (
    !confirm(
      'Remove the configured metrics API key? Prometheus will stop authenticating to /api/metrics until a new key is set.',
    )
  )
    return;
  request('DELETE', '/api/modules/prometheus/api-key')
    .then(function () {
      loadPromSettings();
      loadPromConfig();
    })
    .catch(function (error) {
      alert(error.message);
    });
}

function maskBearerToken(config) {
  return config.replace(/(bearer_token:\s*)(['"])[^'"]+(['"])/g, '$1$2<hidden>$3');
}

function loadPromConfig() {
  request('GET', '/api/modules/prometheus/config')
    .then(function (data) {
      document.getElementById('prom-config-preview').textContent = data.config
        ? maskBearerToken(data.config)
        : 'No config file found.';
    })
    .catch(function () {
      document.getElementById('prom-config-preview').textContent = 'Failed to load config.';
    });
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('prom-metricsApiKey');
  const btn = document.querySelector('[data-testid="btn-toggle-api-key"]');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

function checkPromStatus() {
  request('GET', '/api/modules/prometheus/status')
    .then(function (s) {
      const el = document.getElementById('prom-status');
      const text = document.getElementById('prom-status-text');
      if (s.running) {
        el.className = 'status-bar running';
        text.textContent = 'prometheus running (' + (s.url || '') + ')';
      } else {
        el.className = 'status-bar stopped';
        text.textContent = 'prometheus not reachable';
      }
    })
    .catch(function () {
      document.getElementById('prom-status').className = 'status-bar stopped';
      document.getElementById('prom-status-text').textContent = 'Connection error';
    });
}

/* ==================== Init ==================== */
loadDnsRecords();
loadDnsSettings();
checkDnsStatus();
loadPromSettings();
loadPromConfig();
checkPromStatus();
setInterval(function () {
  checkDnsStatus();
  checkPromStatus();
}, 10000);
