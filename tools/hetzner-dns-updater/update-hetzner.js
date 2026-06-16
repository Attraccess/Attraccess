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

function isValidIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

function expandEnvRefs(input) {
  if (typeof input !== 'string') return '';
  // Replace ${VAR} first
  let out = input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, v) => {
    const val = process.env[v];
    return val == null ? '' : String(val);
  });
  // Replace $VAR (avoid $$ and already replaced forms)
  out = out.replace(/\$(?!\$)([A-Za-z_][A-Za-z0-9_]*)/g, (_, v) => {
    const val = process.env[v];
    return val == null ? '' : String(val);
  });
  return out;
}

function pickForcedIPv4() {
  const forcedRaw = process.env.HETZNER_FORCE_IP || '';
  if (forcedRaw.trim() === '') return '';
  const resolved = expandEnvRefs(forcedRaw.trim());
  if (resolved.includes('$') || resolved.includes('{') || resolved.includes('}')) {
    log('HETZNER_FORCE_IP appears unresolved; ignoring');
  } else if (isValidIPv4(resolved)) {
    return resolved;
  } else {
    log(`HETZNER_FORCE_IP is not a valid IPv4 (${resolved}); ignoring`);
  }
  return '';
}

// Read the device LAN IP from the balenaOS supervisor API. This replaces host
// networking (ATT-514): the container no longer needs to share the host net
// stack just to discover its IP. Requires the io.balena.features.supervisor-api
// label, which injects BALENA_SUPERVISOR_ADDRESS + BALENA_SUPERVISOR_API_KEY.
async function pickSupervisorIPv4() {
  const address = process.env.BALENA_SUPERVISOR_ADDRESS || '';
  const apiKey = process.env.BALENA_SUPERVISOR_API_KEY || '';
  if (!address || !apiKey) return '';
  try {
    const url = `${address.replace(/\/$/, '')}/v1/device?apikey=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      log(`supervisor API returned HTTP ${resp.status}; falling back`);
      return '';
    }
    const data = await resp.json();
    // ip_address is a space-separated list of the device's addresses
    const candidates = String(data?.ip_address || '').split(/\s+/).filter(Boolean);
    for (const ip of candidates) {
      if (ip.startsWith('169.254.')) continue;
      if (isValidIPv4(ip)) return ip;
    }
  } catch (err) {
    log(`supervisor API lookup failed: ${String(err.message || err)}`);
  }
  return '';
}

function pickInterfaceIPv4() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const [, addrs] of Object.entries(nets)) {
    if (!Array.isArray(addrs)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        if (typeof addr.address === 'string' && addr.address.startsWith('169.254.')) continue;
        if (isValidIPv4(addr.address)) return addr.address;
      }
    }
  }
  return '';
}

// Resolution order: explicit override -> balena supervisor -> local interfaces.
// Without host networking, local interfaces only yield the container's bridge IP
// (useless for a DDNS record), so it is the last resort behind the first two.
async function pickLanIPv4() {
  return pickForcedIPv4() || (await pickSupervisorIPv4()) || pickInterfaceIPv4();
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
    // eslint-disable-next-line no-await-in-loop
    const ip = await pickLanIPv4();
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
