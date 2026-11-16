import { UsageAccessCache } from '../../authorization/usage-access-cache';
import { UsageAccessRules } from '../../authorization/usage-access-rules';
import { UsageResourceGate } from '../../authorization/usage-resource-gate';
import { UsageLifecycle } from '../../lifecycle/usage-lifecycle';
import { ResourceUsageService } from '../resource-usage.service';
import { SessionChangeTurns } from '../session-change-turns';
import { UsageDoorActions } from '../usage-door-actions';
import { UsageSessionEnds } from '../usage-session-ends';
import { UsageSessionNotifications } from '../usage-session-notifications';
import { UsageSessionRecords } from '../usage-session-records';
import { UsageSessionStartPreparation } from '../usage-session-start-preparation';
import { UsageSessionStarts } from '../usage-session-starts';

/**
 * Builds ResourceUsageService and its collaborators without Nest, taking the dependencies in the order the
 * service's constructor took them before it was split into collaborators.
 */
export function composeResourceUsageService(
  resourceRepository: unknown,
  resourceUsageRepository: unknown,
  userRepository: unknown,
  resourceIntroductionService: unknown,
  resourceIntroducersService: unknown,
  resourceGroupsIntroductionsService: unknown,
  resourceGroupsService: unknown,
  resourceRetrainingService: unknown,
  resourceMaintenanceService: unknown,
  eventEmitter: unknown,
  billingService: unknown,
  operatingAttributionService: unknown,
  flowExecutorService: unknown,
  projectsService: unknown,
  resourceFormsService: unknown,
  metricsService: unknown,
  resourceHealthService: unknown,
  pluginEvents: unknown,
  rbacService: unknown,
  audit: unknown,
  valkeyClient: unknown,
  metering?: unknown,
): ResourceUsageService {
  const turns = new SessionChangeTurns(resourceRepository as never, valkeyClient as never);
  const rules = new UsageAccessRules(
    resourceIntroductionService as never,
    resourceIntroducersService as never,
    resourceGroupsService as never,
    resourceGroupsIntroductionsService as never,
    resourceRetrainingService as never,
  );
  const access = new UsageAccessCache(
    rules,
    resourceRetrainingService as never,
    metricsService as never,
    rbacService as never,
    eventEmitter as never,
    valkeyClient as never,
  );
  const gate = new UsageResourceGate(
    resourceRepository as never,
    userRepository as never,
    resourceMaintenanceService as never,
    resourceHealthService as never,
    resourceIntroducersService as never,
    rbacService as never,
    access,
  );
  const lifecycle = new UsageLifecycle(
    resourceUsageRepository as never,
    eventEmitter as never,
    billingService as never,
    turns,
    operatingAttributionService as never,
    flowExecutorService as never,
    metering as never,
  );
  const records = new UsageSessionRecords(
    resourceRepository as never,
    resourceUsageRepository as never,
    projectsService as never,
  );
  const notifications = new UsageSessionNotifications(
    resourceUsageRepository as never,
    eventEmitter as never,
    billingService as never,
    metricsService as never,
    pluginEvents as never,
    flowExecutorService as never,
  );
  const doors = new UsageDoorActions(resourceUsageRepository as never, gate, notifications);
  const preparation = new UsageSessionStartPreparation(
    lifecycle,
    gate,
    access,
    records,
    billingService as never,
    projectsService as never,
    resourceFormsService as never,
  );
  const ends = new UsageSessionEnds(
    lifecycle,
    records,
    gate,
    turns,
    resourceFormsService as never,
    audit as never,
    notifications,
  );
  const starts = new UsageSessionStarts(
    lifecycle,
    preparation,
    gate,
    ends,
    billingService as never,
    audit as never,
    notifications,
  );
  return new ResourceUsageService(lifecycle, access, gate, records, doors, preparation, starts, ends);
}

/** The collaborators behind a ResourceUsageService, for tests that reach into the one owning some state. */
export function usageInternals(service: ResourceUsageService) {
  const ends = Reflect.get(service, 'ends') as UsageSessionEnds;
  return {
    lifecycle: Reflect.get(service, 'lifecycle') as UsageLifecycle,
    access: Reflect.get(service, 'access') as UsageAccessCache,
    gate: Reflect.get(service, 'gate') as UsageResourceGate,
    records: Reflect.get(service, 'records') as UsageSessionRecords,
    preparation: Reflect.get(service, 'preparation') as UsageSessionStartPreparation,
    starts: Reflect.get(service, 'starts') as UsageSessionStarts,
    ends,
    turns: Reflect.get(ends, 'turns') as SessionChangeTurns,
  };
}

/**
 * A second API instance on the same database: its own session-change turns (set up by `setUp`), everything else
 * shared with `service`.
 */
export function forkUsageInstance(service: ResourceUsageService, setUp: (turns: SessionChangeTurns) => void) {
  const parts = usageInternals(service);
  const fork = <T extends object>(base: T, own: Record<string, unknown>) =>
    Object.assign(Object.create(base), own) as T;
  const turns = fork(parts.turns, {});
  setUp(turns);
  const lifecycle = fork(parts.lifecycle, { turns });
  const ends = fork(parts.ends, { turns, lifecycle });
  const preparation = fork(parts.preparation, { lifecycle });
  const starts = fork(parts.starts, { lifecycle, preparation, ends });
  return fork(service, { lifecycle, preparation, starts, ends });
}
