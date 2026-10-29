import {
  COMPATIBILITY_TABLE,
  HEADER_ATTRACCESS_VERSION,
  HEADER_PLUGIN_VERSION,
  HEADER_SIDECAR_VERSION,
  HEADER_WIRE_VERSION,
  WIRE_VERSION,
  isWellFormedVersion,
} from '@attraccess/matter-contract';
import type { SupportedCombination } from '@attraccess/matter-contract';
import { satisfies } from 'semver';
import type { IncomingHttpHeaders } from 'node:http';

export type AdmissionResult =
  | { ok: true }
  | { ok: false; code: 'unsupported_wire_version'; message: string; details: Record<string, unknown> }
  | { ok: false; code: 'incompatible_release'; message: string; details: Record<string, unknown> };

export type RunningReleases = { sidecar: string; matterJs: string };

function single(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

function parseWire(value: string | undefined): number | null {
  return value !== undefined && /^[0-9]{1,6}$/.test(value) ? Number(value) : null;
}

function matches(entry: SupportedCombination, received: Record<'attraccess' | 'plugin' | 'sidecar', string | null>) {
  return (
    received.attraccess !== null &&
    satisfies(received.attraccess, entry.attraccess, { includePrerelease: true }) &&
    received.plugin === entry.plugin &&
    received.sidecar === entry.sidecar
  );
}

/**
 * Release headers are compatibility information, not authentication. Malformed values are never echoed back:
 * they are reported as `null` and listed under `malformed`.
 */
export function checkAdmission(headers: IncomingHttpHeaders, running: RunningReleases): AdmissionResult {
  const wire = parseWire(single(headers, HEADER_WIRE_VERSION));
  if (wire !== WIRE_VERSION) {
    return {
      ok: false,
      code: 'unsupported_wire_version',
      message: `Missing, malformed or unsupported wire version. Supported wire version: ${WIRE_VERSION}.`,
      details: { supportedWireVersion: WIRE_VERSION },
    };
  }
  const fields = [
    ['attraccess', HEADER_ATTRACCESS_VERSION],
    ['plugin', HEADER_PLUGIN_VERSION],
    ['sidecar', HEADER_SIDECAR_VERSION],
  ] as const;
  const received: Record<'attraccess' | 'plugin' | 'sidecar', string | null> = {
    attraccess: null,
    plugin: null,
    sidecar: null,
  };
  const problems: string[] = [];
  for (const [field, header] of fields) {
    const value = single(headers, header);
    if (isWellFormedVersion(value)) received[field] = value;
    else problems.push(`${field}:${value === undefined ? 'missing' : 'malformed'}`);
  }
  const supported = COMPATIBILITY_TABLE.filter(
    (entry) => entry.sidecar === running.sidecar && entry.matterJs === running.matterJs,
  );
  if (problems.length === 0 && supported.some((entry) => matches(entry, received))) return { ok: true };
  return {
    ok: false,
    code: 'incompatible_release',
    message:
      'Attraccess, the Matter plugin and the Matter sidecar are not a supported combination. ' +
      'Upgrade or downgrade one of them to a supported combination.',
    details: {
      received: { wireVersion: wire, ...received },
      problems,
      running: { sidecar: running.sidecar, matterJs: running.matterJs },
      supported: COMPATIBILITY_TABLE,
    },
  };
}
