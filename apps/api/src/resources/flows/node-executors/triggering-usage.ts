import { ResourceUsage } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { getSessionCapacity } from '../../usage/sessions/active-usage';
import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';

/** The usage id a flow payload names: `usageId` (button presses) wins over a usage payload's generic `id`. */
export function triggeringUsageId(input: object): number | undefined {
  const isUsageId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  const record = input as { usageId?: unknown; id?: unknown };
  if (isUsageId(record.usageId)) return record.usageId;
  return isUsageId(record.id) ? record.id : undefined;
}

export interface TriggeringUsage {
  /** The usage id named by the payload, whether or not it is still active. */
  triggeringId: number | undefined;
  /** The active session to act on; undefined when nothing must be touched. */
  session: ResourceUsage | undefined;
}

/**
 * The session a flow run outside a usage lifecycle acts on. Lifecycle runs target their candidate instead.
 *
 * - The payload names an active session: that session.
 * - The payload names a session that is no longer active on a machine shared by several people: none, so
 *   a late node (e.g. after a wait) never acts on somebody else's session.
 * - Otherwise (no session named, or a machine limited to one session): the newest session, as before.
 */
export async function resolveTriggeringUsage(
  resourceUsageService: Pick<ResourceUsageService, 'getActiveSessionsForResource'>,
  resourceId: number,
  input: object,
  manager?: EntityManager,
): Promise<TriggeringUsage> {
  const triggeringId = triggeringUsageId(input);
  const sessions = await resourceUsageService.getActiveSessionsForResource(resourceId, manager);
  const triggering = triggeringId === undefined ? undefined : sessions.find(({ id }) => id === triggeringId);
  if (triggering) return { triggeringId, session: triggering };
  const resource = sessions[0]?.resource;
  const sharedMachine = resource ? getSessionCapacity(resource, sessions.length).maxParallelSessions > 1 : false;
  if (triggeringId !== undefined && sharedMachine) return { triggeringId, session: undefined };
  return { triggeringId, session: sessions[sessions.length - 1] };
}
