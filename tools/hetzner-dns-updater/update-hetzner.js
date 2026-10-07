'use strict';
const { getEnvBoolean, log, requireEnv, getEnvNumber } = require('./hetzner-settings.js');
const { getZoneName, upsertARecord, httpJson } = require('./hetzner-records.js');
const { pickLanIPv4 } = require('./lan-address.js');

function normalizeName(rawName, zoneName) {
  if (!rawName || rawName === '@') return '@';
  if (rawName === zoneName) return '@';
  const suffix = `.${zoneName}`;
  return rawName.endsWith(suffix) ? rawName.slice(0, -suffix.length) : rawName;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const enabled = getEnvBoolean('HETZNER_DNS_UPDATER_ENABLED', false);
  if (!enabled) {
    log('disabled; set HETZNER_DNS_UPDATER_ENABLED=true to enable');
    // Keep container alive when disabled

    while (true) {
      // 24h sleep chunks

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

  while (true) {
    const ip = pickLanIPv4();
    if (!ip) {
      log('could not determine LAN IP; retrying in 60s');

      await sleep(60 * 1000);

      continue;
    }

    try {
      await upsertARecord(zoneId, plainLabel, ip, ttl);

      await upsertARecord(zoneId, wildcardName, ip, ttl);
    } catch (err) {
      log(`error during upsert: ${String(err.message || err)}`);
    }

    await sleep(intervalSec * 1000);
  }
}

module.exports = { getEnvNumber, normalizeName, pickLanIPv4, httpJson, upsertARecord, main };

if (require.main === module) {
  main().catch((err) => {
    log(String(err.message || err));
    process.exitCode = 1;
  });
}
