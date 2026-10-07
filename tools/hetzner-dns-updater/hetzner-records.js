'use strict';

const { requireEnv, log } = require('./hetzner-settings.js');

const BASE_URL = 'https://dns.hetzner.com/api/v1';

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
module.exports = { BASE_URL, httpJson, getZoneName, getRecord, createRecord, updateRecord, upsertARecord };
