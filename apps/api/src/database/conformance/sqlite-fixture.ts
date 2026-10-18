import { DataSource, EntityManager } from 'typeorm';
import { AUDIT_COMMIT_BOUNDARY } from '../../audit/persistence/port';
import { SqliteAuditTransactionObserver } from '../../audit/persistence/transaction-observer';
import { BILLING_OPERATIONS } from '../../billing/persistence/port';
import { TypeormBillingPersistence } from '../../billing/persistence/typeorm-adapter';
import { FORM_OPERATIONS } from '../../resources/forms/persistence/port';
import { TypeormFormsPersistence } from '../../resources/forms/persistence/typeorm-adapter';
import { USAGE_OPERATIONS } from '../../resources/usage/persistence/port';
import { TypeormUsagePersistence } from '../../resources/usage/persistence/typeorm-adapter';
import { RESOURCE_INTRODUCER_OPERATIONS } from '../../resources/introducers/persistence/port';
import { TypeormResourceIntroducerPersistence } from '../../resources/introducers/persistence/typeorm-adapter';
import { INTRODUCTION_OPERATIONS } from '../../resources/introductions/persistence/port';
import { TypeormIntroductionPersistence } from '../../resources/introductions/persistence/typeorm-adapter';
import { GROUP_OPERATIONS, GROUP_INTRODUCTION_OPERATIONS } from '../../resources/groups/persistence/port';
import { TypeormGroupPersistence } from '../../resources/groups/persistence/typeorm-adapter';
import {
  MAINTENANCE_OPERATIONS,
  MAINTENANCE_EVALUATION_OPERATIONS,
} from '../../resources/maintenances/persistence/port';
import {
  TypeormMaintenancePersistence,
  TypeormMaintenanceEvaluationPersistence,
} from '../../resources/maintenances/persistence/typeorm-adapter';
import {
  OPERATING_ATTRIBUTION_READS,
  OPERATING_INTERVAL_WRITES,
} from '../../resources/operating-intervals/persistence/port';
import {
  TypeormOperatingAttributionPersistence,
  operatingIntervalTransactionOperations,
} from '../../resources/operating-intervals/persistence/typeorm-adapter';
import { FLOW_EXECUTION_READS } from '../../resources/flows/persistence/port';
import { TypeormFlowExecutionPersistence } from '../../resources/flows/persistence/typeorm-adapter';
import { METERING_OPERATIONS } from '../../resources/metering/persistence/port';
import { TypeormMeteringPersistence } from '../../resources/metering/persistence/typeorm-adapter';
import { UserInvitationService } from '../../users-and-auth/users/user-invitation.service';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AuthenticationDetail,
  AuthenticationType,
  User,
  UserRole,
  Session,
  ResourceUsage,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseTransactions } from '../transaction-scope';
import { SqliteBackend, toApplicationRecord } from '../sqlite/backend';
import { SqliteTransactionDriver, closeResourceTransactionConnection } from '../sqlite/transactions';
import { AuthService } from '../../users-and-auth/auth/auth.service';
import { UsersService } from '../../users-and-auth/users/users.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { AUTHENTICATION_WRITES } from '../../users-and-auth/auth/persistence/port';
import {
  TypeormAuthenticationPersistence,
  authenticationTransactionOperations,
} from '../../users-and-auth/auth/persistence/typeorm-adapter';
import { USER_WRITES } from '../../users-and-auth/users/persistence/port';
import {
  TypeormUserPersistence,
  userTransactionOperations,
} from '../../users-and-auth/users/persistence/typeorm-adapter';
import { RBAC_WRITES } from '../../users-and-auth/rbac/persistence/port';
import { rbacTransactionOperations } from '../../users-and-auth/rbac/persistence/typeorm-adapter';
import { IdentityFixture } from './backend-fixture';

/** Fresh released migrations, a private file and the production independent transaction connection. */
export async function createSqliteFixture(): Promise<IdentityFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-conformance-'));
  const source = new SqliteBackend({ type: 'sqlite', database: join(directory, 'database.sqlite') }).createConnection();
  try {
    await source.initialize();
    const driver = new SqliteTransactionDriver(source);
    driver.register(USER_WRITES, userTransactionOperations);
    driver.register(RBAC_WRITES, rbacTransactionOperations);
    driver.register(AUTHENTICATION_WRITES, authenticationTransactionOperations);
    const transactions = new DatabaseTransactions(driver);
    const rbac = new RbacService(rbacTransactionOperations(source.manager), transactions, new EventEmitter2(), null);
    // SMTP is simulated so failure and attempt counts are deterministic; no message leaves the fixture.
    let failMail = false;
    let mailAttempts = 0;
    const email = {
      sendUserInvitationEmail: async () => {
        mailAttempts++;
        if (failMail) throw new Error('fixture SMTP failure');
      },
    };
    const tokens = { hashToken: (value: string) => `stored:${value}` };
    const counter = { inc: () => undefined, dec: () => undefined };
    const metrics = { usersPerLocale: counter, usersTotal: counter, usersRegisteredTotal: counter };
    const users = new UsersService(
      new TypeormUserPersistence(
        source.getRepository(User),
        source.getRepository(AuthenticationDetail),
        source.getRepository(Session),
        source.getRepository(ResourceUsage),
      ),
      transactions,
      { verifyLicense: async () => undefined } as never,
      email as never,
      tokens as never,
      metrics as never,
      rbac,
      { getDefaultLanguage: async () => 'en' } as never,
    );
    const authentication = new AuthService(
      email as never,
      new TypeormAuthenticationPersistence(source.getRepository(AuthenticationDetail)),
      users,
      tokens as never,
      metrics as never,
    );
    const invitations = new UserInvitationService(users, authentication, email as never);
    const stop = async () => {
      await closeResourceTransactionConnection(source);
      if (source.isInitialized) await source.destroy();
      await rm(directory, { recursive: true, force: true });
    };
    return {
      backend: 'sqlite',
      inviteIdentity: (input) => invitations.inviteUser(input),
      failInvitationDelivery: (fail) => {
        failMail = fail;
      },
      invitationDeliveryAttempts: () => mailAttempts,
      registerIdentity: (input) =>
        users.withTransaction(async (scope) => {
          const user = await users.createOne(
            { username: input.username, email: input.email, externalIdentifier: null },
            scope,
          );
          const detail = await authentication.addAuthenticationDetails(
            user.id,
            { type: AuthenticationType.LOCAL_PASSWORD, details: { password: '' } },
            scope,
            input.passwordHash,
          );
          return { user, authentication: detail };
        }),
      rejectIdentityWrite: async (stage) => {
        await source.query('DROP TRIGGER IF EXISTS reject_identity_write');
        if (!stage) return;
        const entity = stage === 'role' ? UserRole : AuthenticationDetail;
        const table = source.getMetadata(entity).tableName;
        await source.query(
          `CREATE TRIGGER reject_identity_write BEFORE INSERT ON "${table}" BEGIN SELECT RAISE(ABORT, 'identity write rejected'); END`,
        );
      },
      identitySnapshot: async () => {
        const [accounts, grants, details] = await Promise.all([
          source.getRepository(User).find(),
          source.getRepository(UserRole).find(),
          source.getRepository(AuthenticationDetail).find(),
        ]);
        return toApplicationRecord({ users: accounts, grants, authentication: details });
      },
      close: stop,
    };
  } catch (error) {
    await closeResourceTransactionConnection(source);
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Engine-owned composition shared by SQLite integration fixtures. Application services still receive only ports. */
const resourceFixtures = new WeakMap<DataSource, ReturnType<typeof buildResourceFixture>>();
export function sqliteResourceFixture(source: DataSource) {
  let fixture = resourceFixtures.get(source);
  if (!fixture) {
    fixture = buildResourceFixture(source);
    resourceFixtures.set(source, fixture);
  }
  return fixture;
}
function buildResourceFixture(source: DataSource) {
  const driver = new SqliteTransactionDriver(source);
  const observer =
    source.subscribers?.find((entry) => entry instanceof SqliteAuditTransactionObserver) ??
    new SqliteAuditTransactionObserver(source);
  if (source.subscribers) observer.start();
  driver.register(AUDIT_COMMIT_BOUNDARY, (manager) => observer.bind(manager));
  driver.register(BILLING_OPERATIONS, (manager) => new TypeormBillingPersistence(manager));
  driver.register(FORM_OPERATIONS, (manager) => new TypeormFormsPersistence(manager));
  driver.register(USAGE_OPERATIONS, (manager) => new TypeormUsagePersistence(manager));
  driver.register(RESOURCE_INTRODUCER_OPERATIONS, (manager) => new TypeormResourceIntroducerPersistence(manager));
  driver.register(INTRODUCTION_OPERATIONS, (manager) => new TypeormIntroductionPersistence(manager));
  driver.register(GROUP_OPERATIONS, (manager) => new TypeormGroupPersistence(manager));
  driver.register(GROUP_INTRODUCTION_OPERATIONS, (manager) => new TypeormIntroductionPersistence(manager));
  driver.register(MAINTENANCE_OPERATIONS, (manager) => new TypeormMaintenancePersistence(manager));
  driver.register(MAINTENANCE_EVALUATION_OPERATIONS, (manager) => new TypeormMaintenanceEvaluationPersistence(manager));
  driver.register(OPERATING_ATTRIBUTION_READS, (manager) => new TypeormOperatingAttributionPersistence(manager));
  driver.register(OPERATING_INTERVAL_WRITES, operatingIntervalTransactionOperations);
  driver.register(FLOW_EXECUTION_READS, (manager) => new TypeormFlowExecutionPersistence(manager));
  driver.register(METERING_OPERATIONS, (manager) => new TypeormMeteringPersistence(manager));
  return {
    driver,
    transactions: new DatabaseTransactions(driver),
    observer,
    billing: new TypeormBillingPersistence(source.manager),
    forms: new TypeormFormsPersistence(source.manager),
    usage: new TypeormUsagePersistence(source.manager),
    introducers: new TypeormResourceIntroducerPersistence(source.manager),
    introductions: new TypeormIntroductionPersistence(source.manager),
    groupIntroductions: new TypeormIntroductionPersistence(source.manager),
    groups: new TypeormGroupPersistence(source.manager),
    maintenance: new TypeormMaintenancePersistence(source.manager),
    maintenanceEvaluation: new TypeormMaintenanceEvaluationPersistence(source.manager),
    attribution: new TypeormOperatingAttributionPersistence(source.manager),
    flows: new TypeormFlowExecutionPersistence(source.manager),
    metering: new TypeormMeteringPersistence(source.manager),
  };
}

/** Unit fixtures retain their existing repository doubles behind the real operation adapters. Never used by application composition. */
export function sqliteRepositoryFixture(
  repository: (entity: unknown) => object,
  run?: (work: (manager: EntityManager) => Promise<unknown>) => Promise<unknown>,
) {
  const invoke = (entity: unknown, method: string, args: unknown[]) =>
    Reflect.apply(Reflect.get(repository(entity), method), repository(entity), args);
  const manager = {
    getRepository: repository,
    findOne: (entity: unknown, options: unknown) => invoke(entity, 'findOne', [options]),
    findOneBy: (entity: unknown, where: unknown) => invoke(entity, 'findOneBy', [where]),
    find: (entity: unknown, options: unknown) => invoke(entity, 'find', [options]),
    save: (entity: unknown, data: unknown) => invoke(entity, 'save', [data]),
    update: (entity: unknown, where: unknown, data: unknown) => invoke(entity, 'update', [where, data]),
    delete: (entity: unknown, where: unknown) => invoke(entity, 'delete', [where]),
    count: (entity: unknown, options: unknown) => invoke(entity, 'count', [options]),
    exists: (entity: unknown, options: unknown) => invoke(entity, 'exists', [options]),
    existsBy: (entity: unknown, where: unknown) => invoke(entity, 'existsBy', [where]),
    transaction: async (work: (manager: EntityManager) => Promise<unknown>) =>
      run
        ? run((bound) => work(Object.assign(Object.create(manager), bound)))
        : work(manager as unknown as EntityManager),
  };
  const source = { options: { type: 'sqlite' }, manager, subscribers: [] } as unknown as DataSource;
  return { ...sqliteResourceFixture(source), manager: manager as unknown as EntityManager, source };
}

import { ApplicationFixture, ApplicationClient, PhaseGate } from './backend-fixture';
import { ConfigService } from '@nestjs/config';
import { ExternalEffectFailureError } from '../../resources/flows/errors/external-effect-failure.error';
import {
  Resource,
  ResourceType,
  SupervisionMode,
  ResourceBillingConfiguration,
  BillingTransaction,
  BillingTransactionStatus,
  AuditLog,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import { ResourceFormsService } from '../../resources/forms/forms.service';
import { ResourceMeteringService } from '../../resources/metering/resource-metering.service';
import { ResourceOperatingAttributionService } from '../../resources/operating-intervals/resource-operating-attribution.service';
import { BillingService } from '../../billing/charges/billing.service';
import { AuditService } from '../../audit/audit.service';
import { SqliteAuditPersistence } from '../../audit/persistence/sqlite-audit-storage';
import { SqliteSessionStore } from '../../users-and-auth/auth/session-store/persistence/sqlite-session-store';
import { TokenHashService } from '../../encryption/token-hash.service';

function phaseGate(): PhaseGate & { arrive(): Promise<void> } {
  let entered!: () => void;
  let release!: () => void;
  const arrived = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered: arrived,
    release,
    arrive: async () => {
      entered();
      await released;
    },
  };
}

/** Real full schema, ledger triggers, lifecycle rules and audit connections; only external devices/mail are simulated. */
export async function createSqliteApplicationFixture(): Promise<ApplicationFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-application-conformance-'));
  const source = new SqliteBackend({ type: 'sqlite', database: join(directory, 'database.sqlite') }).createConnection();
  const clients: Array<{
    source: DataSource;
    audit: AuditService;
    usage: ResourceUsageService;
    drain(): Promise<void>;
  }> = [];
  const close = async () => {
    for (const client of clients) {
      client.usage.onModuleDestroy();
      await client.drain();
      await client.audit.onModuleDestroy();
      await closeResourceTransactionConnection(client.source);
      if (client.source.isInitialized) await client.source.destroy();
    }
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await source.initialize();
    await source.getRepository(User).save([
      { id: 1, username: 'owner', email: 'owner@example.test' },
      { id: 2, username: 'next', email: 'next@example.test' },
    ]);
    await source.getRepository(Resource).save(
      [1, 2].map((id) => ({
        id,
        name: `Machine ${id}`,
        type: ResourceType.Machine,
        allowTakeOver: true,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
      })),
    );
    await source.getRepository(ResourceBillingConfiguration).save(
      [1, 2].map((resourceId) => ({
        resourceId,
        creditsPerUsage: 7,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      })),
    );
    await source.getRepository(BillingTransaction).save(
      [1, 2].map((userId) => ({
        userId,
        initiatorId: userId,
        amount: 100,
        status: BillingTransactionStatus.Completed,
      })),
    );
    const fixture: ApplicationFixture = {
      capabilities: { independentConnections: true, independentWriters: false, fileBacked: true },
      client: async () => {
        const connection = await new DataSource({ ...source.options, migrationsRun: false }).initialize();
        const ports = sqliteResourceFixture(connection);
        let nextPhase: ReturnType<typeof phaseGate> | undefined;
        let nextEffect: ReturnType<typeof phaseGate> | undefined;
        let nextSession: ReturnType<typeof phaseGate> | undefined;
        const transactions = new DatabaseTransactions({
          backend: ports.driver.backend,
          run: async (conflicts, work) => {
            const gate = nextPhase;
            nextPhase = undefined;
            if (gate) await gate.arrive();
            return ports.driver.run(conflicts, work);
          },
        });
        const settings = {
          getPlainSetting: async (_domain: string, key: string) =>
            key === 'domains' ? JSON.stringify(['billing', 'resource']) : null,
        };
        const audit = new AuditService(new SqliteAuditPersistence(connection), settings as never, ports.observer);
        await audit.onModuleInit();
        const writes: Promise<unknown>[] = [];
        // Public billing methods intentionally fire-and-forget audit. Await these before fixture assertions/DDL/teardown.
        for (const method of ['recordBillingTransaction', 'recordBillingTransactionAfterCommit'] as const) {
          const original = audit[method].bind(audit);
          audit[method] = ((...args: Parameters<typeof original>) => {
            const promise = Reflect.apply(original, audit, args);
            writes.push(promise);
            return promise;
          }) as (typeof audit)[typeof method];
        }
        const drain = async () => {
          while (writes.length) await Promise.all(writes.splice(0));
        };
        let notifications = 0;
        const live = {
          notifyTransactionUpdate: () => {
            notifications++;
          },
        };
        const events = new EventEmitter2();
        events.onAny((event) => {
          if (String(event) !== 'resource.usage.lifecycle.aborted') notifications++;
        });
        const measure = { inc: () => undefined, dec: () => undefined, set: () => undefined, observe: () => undefined };
        const metrics = new Proxy({}, { get: () => measure });
        const billing = new BillingService(
          ports.billing,
          transactions,
          live as never,
          { getNodes: async () => [] } as never,
          { sendResourceUsageBillingSummaryEmail: async () => undefined } as never,
          events,
          metrics as never,
          audit,
        );
        let effects = 0;
        let failure = false;
        const flow = {
          trackResourceActivity: () => undefined,
          runFlow: async () => {
            effects++;
            const gate = nextEffect;
            nextEffect = undefined;
            if (gate) await gate.arrive();
            if (failure)
              throw new ExternalEffectFailureError('simulated device failed after command', new Error('offline'));
          },
        };
        const forms = new ResourceFormsService(ports.forms, transactions);
        const metering = new ResourceMeteringService(ports.metering, transactions, flow as never, audit, live as never);
        const usage = new ResourceUsageService(
          ports.usage,
          transactions,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {
            hasActiveMaintenance: async (id, scope) =>
              scope.resolve(MAINTENANCE_OPERATIONS).hasActive(id, undefined, new Date()),
            canManageMaintenance: async () => false,
          } as never,
          events,
          billing,
          new ResourceOperatingAttributionService(ports.attribution),
          flow as never,
          {} as never,
          forms,
          metrics as never,
          { isResourceUnhealthy: async () => false } as never,
          { emit: () => undefined } as never,
          {} as never,
          audit,
          null,
          metering,
        );
        const hash = new TokenHashService(
          new ConfigService({ app: { AUTH_SESSION_SECRET: 'conformance-only-session-secret' } }),
        );
        const store = new SqliteSessionStore(connection.getRepository(Session), hash);
        const sessions = new Proxy(store, {
          get(target, property) {
            const method = Reflect.get(target, property);
            if (typeof method !== 'function') return method;
            return async (...args: unknown[]) => {
              const gate = nextSession;
              nextSession = undefined;
              if (gate) await gate.arrive();
              return Reflect.apply(method, target, args);
            };
          },
        });
        clients.push({ source: connection, audit, usage, drain });
        const authenticatedUser = async (id: number) =>
          Object.assign(toApplicationRecord(await connection.getRepository(User).findOneByOrFail({ id })), {
            effectivePermissions: new Set(['resources.update']),
          });
        const client: ApplicationClient = {
          connectionIdentity: connection,
          transactions,
          sessions,
          hashToken: (token) => hash.hashToken(token),
          gateNextPhase: () => {
            nextPhase = phaseGate();
            return nextPhase;
          },
          gateNextEffect: () => {
            nextEffect = phaseGate();
            return nextEffect;
          },
          gateNextSession: () => {
            nextSession = phaseGate();
            return nextSession;
          },
          effectCount: () => effects,
          notificationCount: () => notifications,
          failEffect: (fail) => {
            failure = fail;
          },
          start: async (id, userId, takeover = false) =>
            usage.startSession(id, await authenticatedUser(userId), { forceTakeOver: takeover }),
          end: async (id, userId) => usage.endSession(id, await authenticatedUser(userId), {}),
          recover: () => usage.recoverInterruptedLifecycles(),
          charge: async (id) =>
            billing.chargeForResourceUsage(
              toApplicationRecord(
                await connection
                  .getRepository(ResourceUsage)
                  .findOneOrFail({ where: { id }, relations: ['resource', 'user'] }),
              ),
            ),
          manual: (amount) => billing.createManualTransaction(1, 1, amount),
          refund: (id, amount) => billing.refundTransaction(1, id, { amount }),
          recordAudit: () =>
            audit.recordResource({
              action: 'usage_session.started',
              actorId: 1,
              subjectId: 1,
              details: { usageId: 1, usageUserId: 1 },
            }),
          snapshot: async () => {
            await drain();
            return toApplicationRecord({
              balances: (await connection.getRepository(User).find({ order: { id: 'ASC' } })).map(
                (row) => row.creditBalance,
              ),
              usages: await connection.getRepository(ResourceUsage).find({ order: { id: 'ASC' } }),
              ledger: await connection.getRepository(BillingTransaction).find({ order: { id: 'ASC' } }),
              audit: await connection.getRepository(AuditLog).find({ order: { id: 'ASC' } }),
              attempts: await connection.getRepository(ResourceUsageLifecycleAttempt).count(),
            });
          },
        };
        return client;
      },
      seedClosedUsage: async () => {
        const usage = await source.getRepository(ResourceUsage).save({
          resourceId: 1,
          userId: 1,
          usageAction: 'usage' as never,
          startTime: new Date('2026-10-01T10:00:00Z'),
          endTime: new Date('2026-10-01T10:01:00Z'),
          isFinalized: true,
          lifecyclePending: false,
          creditsPerUsage: 7,
          sessionDurationCreditsPerMinute: 0,
          operatingDurationCreditsPerMinute: 0,
          billingFactor: 100,
          meterRates: [],
        });
        await source
          .getRepository(BillingTransaction)
          .save({ userId: 1, resourceUsageId: usage.id, amount: 0, status: BillingTransactionStatus.Pending });
        return usage.id;
      },
      rejectPublication: async (reject) => {
        await source.query('DROP TRIGGER IF EXISTS reject_conformance_publication');
        if (reject)
          await source.query(
            `CREATE TRIGGER reject_conformance_publication BEFORE UPDATE ON resource_usage WHEN NEW.isFinalized = 1 BEGIN SELECT RAISE(ABORT, 'publication rejected'); END`,
          );
      },
      rejectAudit: async (reject) => {
        await source.query('DROP TRIGGER IF EXISTS reject_conformance_audit');
        if (reject)
          await source.query(
            `CREATE TRIGGER reject_conformance_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'audit rejected'); END`,
          );
      },
      integrityViolations: () => source.query('PRAGMA foreign_key_check'),
      close,
    };
    return fixture;
  } catch (error) {
    await close();
    throw error;
  }
}
