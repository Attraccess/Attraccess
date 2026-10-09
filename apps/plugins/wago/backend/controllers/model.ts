import { ConflictException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { WagoConfigurationSnapshot } from '../configuration/model';
import { configurationDiff } from '../configuration/model';
import { WagoController } from './entity';

export const ENROLLMENT_RETRY_MS = 60_000;

export const MAX_PENDING_CONFIGURATION_REPORTS = 100;

export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

export const STALE_AFTER_MS = 90_000;

export function unsafePathSegment(segment: string): boolean {
  return segment === '__proto__' || segment === 'constructor' || segment === 'prototype';
}

export function replacePath(
  value: unknown,
  [segment, ...remaining]: (string | number)[],
  replacement: unknown,
): unknown {
  if (segment === undefined) return replacement;
  if (typeof segment === 'number') {
    const next = Array.isArray(value) ? [...value] : [];
    if (remaining.length) next[segment] = replacePath(next[segment], remaining, replacement);
    else if (replacement === undefined) delete next[segment];
    else next[segment] = replacement;
    return next;
  }

  const entries = Object.entries(value ?? {}).filter(([key]) => key !== segment);
  if (remaining.length)
    entries.push([
      segment,
      replacePath((value as Record<string, unknown> | undefined)?.[segment], remaining, replacement),
    ]);
  else if (replacement !== undefined) entries.push([segment, replacement]);
  return Object.fromEntries(entries);
}

export function applySelectedChanges(
  snapshot: WagoConfigurationSnapshot,
  diff: ReturnType<typeof configurationDiff>,
  selectedPaths: string[],
): WagoConfigurationSnapshot {
  let merged = JSON.parse(JSON.stringify(snapshot)) as WagoConfigurationSnapshot;
  const changes = new Map(diff.map((change) => [change.path, change]));
  for (const path of selectedPaths) {
    const change = changes.get(path);
    if (!change) continue;
    const segments = [...path.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)].map((match) => match[1] ?? Number(match[2]));
    if (!segments.length || segments.some((segment) => typeof segment === 'string' && unsafePathSegment(segment)))
      continue;
    merged = replacePath(merged, segments, change.current) as WagoConfigurationSnapshot;
  }
  return merged;
}

export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function isClaimAcknowledgement(payload: Buffer, token: string): boolean {
  try {
    const value = JSON.parse(payload.toString('utf8')) as { acknowledgementToken?: unknown };
    return typeof value.acknowledgementToken === 'string' && safeEqual(value.acknowledgementToken, token);
  } catch {
    return false;
  }
}

export function isValidHardwareId(hardwareId: string): boolean {
  return Boolean(hardwareId) && !/[/+#]/.test(hardwareId);
}

export function parsePresetProvenance(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class MqttSubscriptionError extends Error {
  constructor(readonly mqttError: unknown) {
    super(String(mqttError));
  }
}

export class WagoCredentialOperationUncertainError extends ConflictException {}

export type WagoControllerSummary = Omit<WagoController, 'fingerprint' | 'pairingCodeHash'> & {
  connectivity: 'online' | 'stale' | 'untrusted' | 'runtime_check' | 'runtime_update';
};
