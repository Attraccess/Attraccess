#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const managedUid = 'pushover-attraccess';
const log = (message) => process.stdout.write(`[grafana-cleanup] ${message}\n`);
const isPushover = (point) => point?.name === 'Pushover' && point.type === 'pushover' && point.provenance === 'file';

// Older builds left a generated UID in Grafana's database. Provisioning the
// stable UID adds another integration to the same contact point instead of
// replacing it, so both send notifications. Only remove the legacy shape;
// this is deliberately not a general purge of file-provisioned contact points.
export async function cleanupLegacyPushover({
  env = process.env,
  fetchImpl = fetch,
  attempts = 60,
  retryDelayMs = 2000,
} = {}) {
  if (!env.PUSHOVER_API_TOKEN || !env.PUSHOVER_USER_KEY) {
    log('Pushover is not configured; skipping cleanup');
    return 0;
  }
  if (!env.GF_SECURITY_ADMIN_USER || !env.GF_SECURITY_ADMIN_PASSWORD) {
    throw new Error('Set GF_SECURITY_ADMIN_USER and GF_SECURITY_ADMIN_PASSWORD to the current Grafana credentials');
  }

  const endpoint = `${(env.GRAFANA_URL || 'http://grafana:3000').replace(/\/$/, '')}/api/v1/provisioning/contact-points`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`${env.GF_SECURITY_ADMIN_USER}:${env.GF_SECURITY_ADMIN_PASSWORD}`).toString('base64')}`,
    'X-Grafana-Org-Id': '1',
  };
  const request = (url, method = 'GET') =>
    fetchImpl(url, { method, headers, signal: AbortSignal.timeout(5000), redirect: 'error' });

  let response;
  let points;
  let managedReady = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Compose/Balena can start this job before Grafana's HTTP server is ready.
    try {
      response = await request(endpoint);
    } catch {
      response = undefined;
    }
    if (response?.status === 401 || response?.status === 403) {
      throw new Error(
        `Grafana authentication failed (HTTP ${response.status}); configure the current Grafana credentials`,
      );
    }
    if (response?.ok) {
      try {
        points = await response.json();
      } catch {
        throw new Error('Invalid contact points response; no cleanup performed');
      }
      if (!Array.isArray(points)) throw new Error('Invalid contact points response; no cleanup performed');

      // The HTTP API can become ready before file provisioning finishes. Wait
      // for the replacement as well, so that startup race cannot skip cleanup.
      managedReady = points.some(
        (point) => isPushover(point) && point.uid === managedUid && point.settings?.title && point.settings?.message,
      );
      if (managedReady) break;
    }
    if (attempt + 1 < attempts) await delay(retryDelayMs);
  }
  if (!response?.ok) {
    throw new Error('Grafana contact points API did not become available; no cleanup performed');
  }

  // Never remove the last receiver for the provisioned Pushover policy. Also
  // require the current templates, so an older image/config is left untouched.
  if (!managedReady) {
    log('Current managed Pushover receiver is absent; skipping cleanup');
    return 0;
  }
  const legacyPoints = points.filter(
    (point) =>
      isPushover(point) &&
      typeof point.uid === 'string' &&
      /^[a-zA-Z0-9_-]{1,40}$/.test(point.uid) &&
      point.uid !== managedUid &&
      !point.settings?.title &&
      !point.settings?.message,
  );
  for (const point of legacyPoints) {
    const result = await request(`${endpoint}/${encodeURIComponent(point.uid)}`, 'DELETE');
    if (!result.ok && result.status !== 404) {
      throw new Error(`Could not delete legacy Pushover receiver ${point.uid} (HTTP ${result.status})`);
    }
    log(`Removed legacy Pushover receiver ${point.uid}`);
  }
  log(`Cleanup complete (${legacyPoints.length} legacy receiver(s))`);
  return legacyPoints.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cleanupLegacyPushover().catch((error) => {
    process.stderr.write(`[grafana-cleanup] ${error.message}\n`);
    process.exitCode = 1;
  });
}
