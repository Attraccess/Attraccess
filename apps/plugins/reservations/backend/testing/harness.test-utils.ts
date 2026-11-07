import type { PluginAccessPrincipal, PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { GlobalSettingsEntity } from '../entities/global-settings.entity';
import { IcalFeedEntity } from '../entities/ical-feed.entity';
import { NoticeEntity } from '../entities/notice.entity';
import { ReservationEntity } from '../entities/reservation.entity';
import { ResourceSettingsEntity } from '../entities/resource-settings.entity';
import * as pluginMigrations from '../migrations';
import { AccessService } from '../reservations/access.service';
import type { ReservationActor } from '../reservations/actor';
import type { VisibilityService } from '../ical/visibility.service';
import type { DirectoryService } from '../reservations/directory.service';
import type { ReservationNotifier } from '../reservations/notifier';
import { ReservationQueryService } from '../reservations/reservation-query.service';
import { ReservationService } from '../reservations/reservation.service';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { SettingsAdminService } from '../settings/settings-admin.service';
import type { ResourceSettingsValues } from '../settings/settings.model';

export const principal = (userId: number): PluginAuditPrincipal => ({ userId, authenticationMethod: 'session' });

/** A request actor authenticated with an API token scoped to `scope` (what `principalOf` builds for it). */
export const tokenActor = (userId: number, scope: string[], apiTokenId = 1): ReservationActor => ({
  userId,
  authenticationMethod: 'api-token',
  apiTokenId,
  effectivePermissions: new Set(scope),
});

interface AccessState {
  permissions: Map<number, Set<string>>;
  maintainers: Map<number, Set<number>>; // userId -> resourceIds
  canStart: Map<number, { allowed: boolean; requiresSupervision: boolean; supervisionAllowed: boolean }>;
  maintenance: { maintenanceId: number; resourceId: number; startTime: Date; endTime: Date | null; reason: null }[];
  sessions: { usageId: number; resourceId: number; userId: number; startTime: Date }[];
  introduced: Map<number, number[]>; // userId -> resourceIds
  maintained: Map<number, number[]>; // extra maintained ids (besides makeManager)
  hidden: Set<number>; // resourceIds only in hidden groups (invisible to everyone in these tests)
}

/** Real SQLite (temp file), real services, scripted host facade. Time is controlled via `setNow`. */
export async function createHarness() {
  const dir = mkdtempSync(join(tmpdir(), 'reservations-test-'));
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: join(dir, 'db.sqlite'),
    entities: [ReservationEntity, ResourceSettingsEntity, GlobalSettingsEntity, IcalFeedEntity, NoticeEntity],
    // Every migration the plugin registers (migrations.ts), as the host would run them.
    migrations: Object.values(pluginMigrations),
    synchronize: false,
  }).initialize();
  await dataSource.runMigrations();

  let now = new Date('2026-06-01T08:00:00.000Z');
  const state: AccessState = {
    permissions: new Map(),
    maintainers: new Map(),
    canStart: new Map(),
    maintenance: [],
    sessions: [],
    introduced: new Map(),
    maintained: new Map(),
    hidden: new Set(),
  };
  const dispatch = jest.fn(async (_request: unknown) => undefined);
  const handlers = new Map<string, ((payload: never) => unknown)[]>();
  const knownResources = new Set([1, 2, 3]);
  const audit = { record: jest.fn(async () => ({ status: 'recorded' as const })) };
  const notifier = {
    onPending: jest.fn(),
    onConfirmed: jest.fn(),
    onRejected: jest.fn(),
    onCancelled: jest.fn(),
    onEndedEarly: jest.fn(),
    onRemoved: jest.fn(),
  } satisfies ReservationNotifier;

  // Mirrors the host: concurrent callers run one at a time inside a transaction.
  let tail: Promise<unknown> = Promise.resolve();
  const runSerialized = <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
    const next = tail.catch(() => undefined).then(() => dataSource.transaction(work));
    tail = next;
    return next;
  };

  // Like the host: a principal with effectivePermissions (a request's user) only uses the permissions inside that
  // scope; a plain id uses the user's full permissions. Maintainer roles and introductions are not permissions.
  const idOf = (subject: PluginAccessPrincipal) => (typeof subject === 'number' ? subject : subject.id);
  const permissionsOf = (subject: PluginAccessPrincipal): Set<string> => {
    const own = state.permissions.get(idOf(subject)) ?? new Set<string>();
    if (typeof subject === 'number' || subject.effectivePermissions === undefined) return own;
    const scope = new Set(subject.effectivePermissions);
    return new Set([...own].filter((permission) => scope.has(permission)));
  };

  const context = {
    audit,
    dataSource,
    logger: console,
    notifications: { dispatch },
    onEvent: (event: string, handler: (payload: never) => unknown) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return {
        off: () =>
          handlers.set(
            event,
            (handlers.get(event) ?? []).filter((h) => h !== handler),
          ),
      };
    },
    runSerialized,
    getRepository: (entity: never) => dataSource.getRepository(entity),
    resourceAccess: {
      hasPermission: async (subject: PluginAccessPrincipal, permission: string) =>
        permissionsOf(subject).has(permission),
      // Like the host: the maintenance permission counts as maintainer of every resource.
      canMaintain: async (subject: PluginAccessPrincipal, resourceId: number) =>
        permissionsOf(subject).has('resources.maintenance.manage') ||
        (state.maintainers.get(idOf(subject))?.has(resourceId) ?? false),
      // Like the host: the maintenance permission manages every resource.
      listResourceIdsMaintained: async (subject: PluginAccessPrincipal) =>
        permissionsOf(subject).has('resources.maintenance.manage')
          ? [...knownResources]
          : [...(state.maintainers.get(idOf(subject)) ?? [])],
      listResourceIdsIntroduced: async (subject: PluginAccessPrincipal) => state.introduced.get(idOf(subject)) ?? [],
      getActiveSessions: async (resourceId: number) =>
        state.sessions.filter((session) => session.resourceId === resourceId),
      canStart: async (subject: PluginAccessPrincipal) =>
        state.canStart.get(idOf(subject)) ?? { allowed: false, requiresSupervision: false, supervisionAllowed: false },
      getMaintenanceWindows: async (resourceId: number, from: Date, to: Date) =>
        state.maintenance.filter(
          (window) =>
            window.resourceId === resourceId &&
            window.startTime.getTime() < to.getTime() &&
            (window.endTime === null || window.endTime.getTime() > from.getTime()),
        ),
    },
  } as unknown as PluginContext;

  const directory = {
    getResource: async (id: number) => (knownResources.has(id) ? { id, name: `Resource ${id}` } : null),
    getResourceNames: async (ids: number[]) => new Map(ids.map((id) => [id, `Resource ${id}`])),
    getUserNames: async (ids: number[]) => new Map(ids.map((id) => [id, `user${id}`])),
  } as unknown as DirectoryService;

  const visibility = {
    filterVisible: async (_userId: number, ids: number[]) =>
      [...new Set(ids)].filter((id) => knownResources.has(id) && !state.hidden.has(id)),
    resourceIdsOfGroups: async () => [],
    isActiveAccount: async () => true,
    resourceIdsRequiringSupervision: async () => [],
  } as unknown as VisibilityService;

  const clock = () => now;
  const store = new ReservationStore(context);
  const settings = new ResourceSettingsService(context);
  const globalSettings = new GlobalSettingsService(context);
  const access = new AccessService(context);
  const reservations = new ReservationService(
    context,
    store,
    settings,
    globalSettings,
    access,
    directory,
    visibility,
    notifier,
    clock,
  );
  const queries = new ReservationQueryService(
    context,
    store,
    settings,
    globalSettings,
    access,
    directory,
    reservations,
    clock,
    visibility,
  );
  const admin = new SettingsAdminService(settings, globalSettings, reservations, access, directory);
  await globalSettings.setTimezone('Europe/Berlin');

  return {
    dataSource,
    context,
    state,
    audit,
    notifier,
    dispatch,
    clock,
    /** Delivers a host event to the plugin's subscribers (like the host's emitter). */
    async emit(event: string, payload: unknown) {
      for (const handler of handlers.get(event) ?? []) await handler(payload as never);
    },
    store,
    settings,
    globalSettings,
    access,
    reservations,
    queries,
    admin,
    directory,
    visibility,
    setNow: (value: string | Date) => {
      now = new Date(value);
    },
    /** Enables reservations for the resource with `can-start` replaced by any-user unless overridden. */
    async enable(resourceId: number, patch: Partial<ResourceSettingsValues> = {}) {
      await settings.update(resourceId, { enabled: true, whoCanBook: 'any-user', ...patch });
    },
    makeManager(userId: number, resourceId: number) {
      state.maintainers.set(userId, new Set([...(state.maintainers.get(userId) ?? []), resourceId]));
    },
    grant(userId: number, permission: string) {
      state.permissions.set(userId, new Set([...(state.permissions.get(userId) ?? []), permission]));
    },
    async close() {
      await reservations.flushNotifications();
      await dataSource.destroy();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** ISO helper: UTC time on 2026-06-01 + `days`. */
export function at(isoWithoutZone: string): Date {
  return new Date(`${isoWithoutZone}Z`);
}
