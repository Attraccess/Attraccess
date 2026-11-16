import { AuditLog, Resource, ResourceType, Setting, SupervisionMode, User } from '@attraccess/database-entities';
import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../database/run-serialized-transaction';
import { AuditMetrics } from '../metrics/definitions/audit.metrics';
import { resetTestFixture } from '../resources/usage/lifecycle-persistence/fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../resources/usage/lifecycle-persistence/fixtures/state.test-fixture';
import { SettingsStoreService } from '../settings/settings-store.service';
import { usageInternals } from '../resources/usage/sessions/fixtures/compose.test-fixture';
import { AuditService } from './audit.service';
import { createTestAuditMetrics } from './audit.test-fixture';

/** A machine with the person who starts sessions on it and the person who takes it over. */
export interface LoadMachine {
  resourceId: number;
  owner: User;
  taker: User;
}

/**
 * The real usage lifecycle (ResourceUsageService on file-backed SQLite, see the lifecycle-persistence fixture)
 * wired to a real AuditService on the same database file, with the audit tables and default audit settings.
 */
export function setupAuditLoadFixture(machineCount: number) {
  const lifecycle = createUsageLifecyclePersistenceAroundExternalFlowsFixture();
  // The lifecycle fixture builds its database from `schemas`; the audit tables join the same file. Every other
  // property resolves to the lifecycle fixture, so its setters keep working.
  const scope: typeof lifecycle = Object.create(lifecycle, {
    schemas: { value: [...lifecycle.schemas, AuditLog, Setting] },
  });
  let audit: AuditService;
  let metrics: AuditMetrics;
  let machines: LoadMachine[];

  beforeEach(async () => {
    await resetTestFixture(scope);
    metrics = createTestAuditMetrics();
    // No stored audit settings: the defaults record the resource and administration domains.
    audit = new AuditService(
      scope.source,
      new SettingsStoreService(scope.source.getRepository(Setting), null),
      metrics,
    );
    await audit.onModuleInit();
    // Swap the fixture's audit stub for the real service in the collaborators that record usage audits.
    const { starts, ends } = usageInternals(scope.usage);
    Object.assign(starts, { audit });
    Object.assign(ends, { audit });

    const resources = Array.from({ length: machineCount }, (_, index) => index + 1);
    await scope.source.getRepository(Resource).save(
      resources.map((id) => ({
        id,
        name: `Machine ${id}`,
        type: ResourceType.Machine,
        allowTakeOver: true,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
      })),
    );
    const people = await scope.source.getRepository(User).save(
      resources.flatMap((id) => [
        { id: 100 + id, username: `owner-${id}` },
        { id: 200 + id, username: `taker-${id}` },
      ]),
    );
    people.forEach((person) => Object.assign(person, { effectivePermissions: new Set(['resources.update']) }));
    machines = resources.map((resourceId) => ({
      resourceId,
      owner: people.find((person) => person.id === 100 + resourceId) as User,
      taker: people.find((person) => person.id === 200 + resourceId) as User,
    }));
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    // Drain the audit connection and close the resource-lifecycle connection before the file goes away.
    await audit?.onModuleDestroy();
    if (scope.source) {
      await closeResourceTransactionConnection(scope.source);
      if (scope.source.isInitialized) await scope.source.destroy();
    }
    if (scope.directory) await rm(scope.directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  return {
    get source() {
      return scope.source;
    },
    get usage() {
      return scope.usage;
    },
    get audit() {
      return audit;
    },
    get metrics() {
      return metrics;
    },
    get machines() {
      return machines;
    },
  };
}
