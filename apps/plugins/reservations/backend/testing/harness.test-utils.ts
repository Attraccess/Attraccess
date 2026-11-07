import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { GlobalSettingsEntity } from '../entities/global-settings.entity';
import { IcalFeedEntity } from '../entities/ical-feed.entity';
import { NoticeEntity } from '../entities/notice.entity';
import { ReservationEntity } from '../entities/reservation.entity';
import { ResourceSettingsEntity } from '../entities/resource-settings.entity';
import { CreateReservations1790000000000 } from '../migrations/1790000000000-create-reservations';
import { AccessService } from '../reservations/access.service';
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

interface AccessState {
  permissions: Map<number, Set<string>>;
  maintainers: Map<number, Set<number>>; // userId -> resourceIds
  canStart: Map<number, { allowed: boolean; requiresSupervision: boolean; supervisionAllowed: boolean }>;
  maintenance: { maintenanceId: number; resourceId: number; startTime: Date; endTime: Date | null; reason: null }[];
}

/** Real SQLite (temp file), real services, scripted host facade. Time is controlled via `setNow`. */
export async function createHarness() {
  const dir = mkdtempSync(join(tmpdir(), 'reservations-test-'));
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: join(dir, 'db.sqlite'),
    entities: [ReservationEntity, ResourceSettingsEntity, GlobalSettingsEntity, IcalFeedEntity, NoticeEntity],
    migrations: [CreateReservations1790000000000],
    synchronize: false,
  }).initialize();
  await dataSource.runMigrations();

  let now = new Date('2026-06-01T08:00:00.000Z');
  const state: AccessState = { permissions: new Map(), maintainers: new Map(), canStart: new Map(), maintenance: [] };
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

  const context = {
    audit,
    dataSource,
    logger: console,
    runSerialized,
    getRepository: (entity: never) => dataSource.getRepository(entity),
    resourceAccess: {
      hasPermission: async (userId: number, permission: string) =>
        state.permissions.get(userId)?.has(permission) ?? false,
      canMaintain: async (userId: number, resourceId: number) =>
        state.maintainers.get(userId)?.has(resourceId) ?? false,
      listResourceIdsMaintained: async (userId: number) => [...(state.maintainers.get(userId) ?? [])],
      canStart: async (userId: number) =>
        state.canStart.get(userId) ?? { allowed: false, requiresSupervision: false, supervisionAllowed: false },
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
  );
  const admin = new SettingsAdminService(settings, globalSettings, reservations, access, directory);
  await globalSettings.setTimezone('Europe/Berlin');

  return {
    dataSource,
    context,
    state,
    audit,
    notifier,
    store,
    settings,
    globalSettings,
    access,
    reservations,
    queries,
    admin,
    directory,
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
