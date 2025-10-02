'use strict';

const BASE_URL = 'https://dns.hetzner.com/api/v1';

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

async function httpJson(url, init = {}) {
  const headers = init.headers ? { ...init.headers } : {};
  headers['Auth-API-Token'] = requireEnv('HETZNER_API_TOKEN');
  if (init.body && typeof init.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(init.body);
  }
  const resp = await fetch(url, { ...init, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${text || url}`);
  }
  return resp.json();
}

async function getZoneName(zoneId) {
  const data = await httpJson(`${BASE_URL}/zones/${zoneId}`);
  return data?.zone?.name || '';
}

function normalizeName(rawName, zoneName) {
  if (!rawName || rawName === '@') return '@';
  if (rawName === zoneName) return '@';
  const suffix = `.${zoneName}`;
  return rawName.endsWith(suffix) ? rawName.slice(0, -suffix.length) : rawName;
}

async function getRecord(zoneId, name) {
  const q = new URLSearchParams({ zone_id: zoneId, name, type: 'A' });
  return httpJson(`${BASE_URL}/records?${q.toString()}`);
}

async function createRecord(zoneId, name, value, ttl) {
  return httpJson(`${BASE_URL}/records`, {
    method: 'POST',
    body: { value, ttl, type: 'A', name, zone_id: zoneId },
  });
}

async function updateRecord(recordId, zoneId, name, value, ttl) {
  return httpJson(`${BASE_URL}/records/${recordId}`, {
    method: 'PUT',
    body: { value, ttl, type: 'A', name, zone_id: zoneId },
  });
}

async function upsertARecord(zoneId, name, value, ttl) {
  const resp = await getRecord(zoneId, name);
  const record = Array.isArray(resp?.records) ? resp.records[0] : undefined;
  const recordId = record?.id || '';
  const currentValue = record?.value || '';
  if (!recordId) {
    log(`creating A record ${name} -> ${value}`);
    try {
      await createRecord(zoneId, name, value, ttl);
    } catch (err) {
      log(`create failed for ${name}: ${String(err.message || err)}`);
    }
  } else if (currentValue !== value) {
    log(`updating A record ${name}: ${currentValue} -> ${value}`);
    try {
      await updateRecord(recordId, zoneId, name, value, ttl);
    } catch (err) {
      log(`update failed for ${name}: ${String(err.message || err)}`);
    }
  } else {
    log(`no change (${name} is ${value})`);
  }
}

function pickLanIPv4() {
  const forced = process.env.HETZNER_FORCE_IP;
  if (forced && forced.trim() !== '') return forced.trim();

  const os = require('os');
  const nets = os.networkInterfaces();
  for (const [iface, addrs] of Object.entries(nets)) {
    if (!Array.isArray(addrs)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        // Skip link-local
        if (typeof addr.address === 'string' && addr.address.startsWith('169.254.')) continue;
        return addr.address;
      }
    }
  }
  return '';
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const enabled = getEnvBoolean('HETZNER_DNS_UPDATER_ENABLED', false);
  if (!enabled) {
    log('disabled; set HETZNER_DNS_UPDATER_ENABLED=true to enable');
    // Keep container alive when disabled
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // 24h sleep chunks
      // eslint-disable-next-line no-await-in-loop
      await sleep(24 * 60 * 60 * 1000);
    }
  }

  const zoneId = requireEnv('HETZNER_ZONE_ID');
  const ttl = getEnvNumber('HETZNER_TTL', 300);
  const intervalSec = getEnvNumber('HETZNER_INTERVAL_SECONDS', 900);
  const recordName = process.env.HETZNER_RECORD_NAME || '@';

  const zoneName = await getZoneName(zoneId).catch((err) => {
    log(`failed to determine zone name for id ${zoneId}: ${String(err.message || err)}`);
    return '';
  });
  if (!zoneName) {
    process.exitCode = 1;
    return;
  }

  const baseName = normalizeName(recordName, zoneName);
  let plainLabel = baseName;
  if (baseName.startsWith('*.')) plainLabel = baseName.slice(2);
  const wildcardName = plainLabel === '@' ? '*' : `*.${plainLabel}`;

  // Loop forever
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ip = pickLanIPv4();
    if (!ip) {
      log('could not determine LAN IP; retrying in 60s');
      // eslint-disable-next-line no-await-in-loop
      await sleep(60 * 1000);
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await upsertARecord(zoneId, plainLabel, ip, ttl);
      // eslint-disable-next-line no-await-in-loop
      await upsertARecord(zoneId, wildcardName, ip, ttl);
    } catch (err) {
      log(`error during upsert: ${String(err.message || err)}`);
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalSec * 1000);
  }
}

main().catch((err) => {
  log(String(err.message || err));
  process.exitCode = 1;
});
