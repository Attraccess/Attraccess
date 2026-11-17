import type { PluginAccessPrincipal, PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqlitePluginPersistence, DataSource, type EntityManager } from '@attraccess/plugins-backend-sdk/sqlite';
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

/** Permissions under which core may show who uses a machine at all. */
const ATTRIBUTION_SCOPE = ['resources.read', 'resources.update', 'resources.access.manage'];

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
  attribution: Map<number, Set<number>>; // userId -> resourceIds whose users' names they may see
  limits: Map<number, number>; // effective session limit per resource (default 1)
  hidden: Set<number>; // resourceIds only in hidden groups (invisible to everyone in these tests)
}

/**
 * Like the host's SQLite connection: transactions begin IMMEDIATE (reserving the writer up front, waiting through the
 * busy timeout), so two connections on one file serialize their writes instead of failing a lock upgrade.
 */
function beginImmediately(dataSource: DataSource): void {
  const runner = dataSource.createQueryRunner(); // the SQLite driver hands every caller this one runner
  const query = runner.query.bind(runner) as (...args: unknown[]) => Promise<unknown>;
  runner.query = ((sql: string, ...rest: unknown[]) =>
    query(sql === 'BEGIN TRANSACTION' ? 'BEGIN IMMEDIATE TRANSACTION' : sql, ...rest)) as typeof runner.query;
}

/**
 * Real SQLite (temp file), real services, scripted host facade. Time is controlled via `setNow`. Pass the
 * `databasePath` of another harness to run a second, independent host (own connection, own services) on its file.
 */
export async function createHarness(options: { databasePath?: string } = {}) {
  const dir = options.databasePath ? null : mkdtempSync(join(tmpdir(), 'reservations-test-'));
  const databasePath = options.databasePath ?? join(dir as string, 'db.sqlite');
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: databasePath,
    busyTimeout: 10_000,
    entities: [ReservationEntity, ResourceSettingsEntity, GlobalSettingsEntity, IcalFeedEntity, NoticeEntity],
    // Every migration the plugin registers (migrations.ts), as the host would run them.
    migrations: Object.values(pluginMigrations),
    synchronize: false,
  }).initialize();
  beginImmediately(dataSource);
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
    attribution: new Map(),
    limits: new Map(),
    hidden: new Set(),
  };
  const dispatch = jest.fn(async (_request: unknown) => undefined);
  const invalidateStartBlocked = jest.fn((_scope: { resourceId: number }) => undefined);
  const invalidateReaderUi = jest.fn((_scope: { resourceId?: number; readerId?: number }) => undefined);
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
  const runInTransaction = <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
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
    logger: console,
    persistence: createSqlitePluginPersistence({
      pluginName: 'reservations',
      connection: () => dataSource,
      entities: [ReservationEntity, ResourceSettingsEntity, GlobalSettingsEntity, IcalFeedEntity, NoticeEntity],
      runInTransaction,
    }),
    notifications: { dispatch },
    startBlocked: { invalidate: invalidateStartBlocked },
    readerUi: { invalidate: invalidateReaderUi },
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
    resourceAccess: {
      // Core's rule for the current user's name; scripted per user and resource. Like core, a request scope without
      // resources.read (or update / access.manage) sees nobody's name.
      canSeeUsageAttribution: async (subject: PluginAccessPrincipal, resourceId: number) =>
        (typeof subject === 'number' ||
          subject.effectivePermissions === undefined ||
          ATTRIBUTION_SCOPE.some((permission) => new Set(subject.effectivePermissions).has(permission))) &&
        (state.attribution.get(idOf(subject))?.has(resourceId) ?? false),
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
    // Like the real lookup: an unknown (deleted) resource reads as limit 1, or as null where the caller asks.
    getSessionLimit: async (id: number) => (knownResources.has(id) ? (state.limits.get(id) ?? 1) : 1),
    findSessionLimit: async (id: number) => (knownResources.has(id) ? (state.limits.get(id) ?? 1) : null),
    getActiveSessions: async (id: number) => state.sessions.filter((session) => session.resourceId === id),
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
    databasePath,
    context,
    state,
    audit,
    notifier,
    dispatch,
    invalidateStartBlocked,
    invalidateReaderUi,
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
    /** Effective session limit of the resource (what core's `sessionLimitOf` answers). */
    setLimit(resourceId: number, limit: number) {
      state.limits.set(resourceId, limit);
    },
    /** The resource is (soft-)deleted in core: lookups no longer find it. */
    deleteResource(resourceId: number) {
      knownResources.delete(resourceId);
    },
    makeManager(userId: number, resourceId: number) {
      state.maintainers.set(userId, new Set([...(state.maintainers.get(userId) ?? []), resourceId]));
    },
    /** Lets the user see who uses the resource (core's usage attribution rule). */
    allowAttribution(userId: number, resourceId: number) {
      state.attribution.set(userId, new Set([...(state.attribution.get(userId) ?? []), resourceId]));
    },
    grant(userId: number, permission: string) {
      state.permissions.set(userId, new Set([...(state.permissions.get(userId) ?? []), permission]));
    },
    async close() {
      await reservations.flushNotifications();
      await dataSource.destroy();
      if (dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** ISO helper: UTC time on 2026-06-01 + `days`. */
export function at(isoWithoutZone: string): Date {
  return new Date(`${isoWithoutZone}Z`);
}
