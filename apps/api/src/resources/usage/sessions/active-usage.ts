import type { UsageSession, UsageSessionResource, UsageSessionUser } from '@attraccess/application-models';
import { ResourceType } from '@attraccess/application-models';
import { BadRequestException } from '@nestjs/common';
import { NoOwnActiveSessionError } from '../errors/no-own-active-session.error';
import { publishedState } from './published-state';

/**
 * SQL condition of a published, usable session on the usage table under `alias`. The released migration
 * 1790100000000 imports it from this module, so it stays here; the persistence adapter's queries use it too.
 */
export function activeUsageSql(alias: string): string {
  return `${alias}.endTime IS NULL AND ${Object.entries(publishedState)
    .map(([column, value]) => `${alias}.${column} = ${typeof value === 'boolean' ? Number(value) : `'${value}'`}`)
    .join(' AND ')}`;
}

/** In-memory counterpart of the active-sessions query, for usages that were loaded without that filter. */
export function isActiveUsage(usage: Pick<UsageSession, 'endTime' | keyof typeof publishedState>): boolean {
  return (
    usage.endTime == null &&
    Object.entries(publishedState).every(([column, value]) => usage[column as keyof typeof publishedState] === value)
  );
}

/**
 * Without a usageId the caller's own session is ended, never somebody else's. Only on a machine with an
 * effective limit of 1 may a single remaining session be ended without naming it (force-stop as before).
 */
export function pickSessionToEnd<T extends Pick<UsageSession, 'id' | 'userId'>>(
  sessions: T[],
  user: Pick<UsageSessionUser, 'id'>,
  usageId: number | undefined,
  sessionLimit: number,
): T {
  if (usageId !== undefined) {
    const target = sessions.find((session) => session.id === usageId);
    if (!target) throw new BadRequestException('No active session found');
    return target;
  }
  if (sessions.length === 0) throw new BadRequestException('No active session found');
  // Newest first, so legacy duplicates of one person keep ending the newest one.
  const own = [...sessions].reverse().find((session) => session.userId === user.id);
  if (own) return own;
  if (sessionLimit <= 1 && sessions.length === 1) return sessions[0];
  throw new NoOwnActiveSessionError();
}

type CapacityResource = Pick<UsageSessionResource, 'type'> & { maxParallelSessions?: number | null };

/** Effective number of parallel sessions. Doors and unknown resources behave like a limit of 1. */
export function sessionLimitOf(resource: CapacityResource | null | undefined): number {
  return resource?.type === ResourceType.Machine ? Math.max(1, resource.maxParallelSessions ?? 1) : 1;
}

/** Slot usage for display and gating. Doors always behave like a limit of 1. */
export function getSessionCapacity(
  resource: CapacityResource,
  activeSessionCount: number,
): { activeSessionCount: number; maxParallelSessions: number; isFull: boolean } {
  const maxParallelSessions = sessionLimitOf(resource);
  return { activeSessionCount, maxParallelSessions, isFull: activeSessionCount >= maxParallelSessions };
}
