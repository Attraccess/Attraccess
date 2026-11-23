import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_RECORDER } from '../../../../audit/recorder/audit-event';
import type { TransactionScope, UnitOfWork } from '../../../../database/unit-of-work';
import { UNIT_OF_WORK } from '../../../../database/unit-of-work';
import { BillingService } from '../../../../billing/charges/billing.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { PluginEventsService } from '../../../../plugin-system/plugin-events.service';
import { ProjectsService } from '../../../../projects/projects.service';
import { RbacService } from '../../../../users-and-auth/rbac/rbac.service';
import { VALKEY_CLIENT } from '../../../../valkey/valkey.module';
import { ResourceFlowsExecutorService } from '../../../flows/execution/resource-flows-executor.service';
import { ResourceFormsService } from '../../../forms/forms.service';
import { ResourceGroupsIntroducersService } from '../../../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsIntroductionsService } from '../../../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsService } from '../../../groups/resourceGroups.service';
import { ResourceHealthService } from '../../../health/resource-health.service';
import { ResourceIntroducersService } from '../../../introducers/resourceIntroducers.service';
import { ResourceIntroductionsService } from '../../../introductions/resouceIntroductions.service';
import { ResourceMaintenanceService } from '../../../maintenances/maintenance.service';
import { ResourcesService } from '../../../resources.service';
import { ResourceRetrainingService } from '../../../retraining/resourceRetraining.service';
import { RESOURCE_USAGE_COLLABORATORS } from '../../resource-usage.collaborators';
import { SESSION_DEADLINE_STORE } from '../../session-duration/session-deadline-store.port';
import { USAGE_SESSION_STORE, UsageSessionStore } from '../../usage-session-store.port';
import { ResourceUsageService } from '../resource-usage.service';
import { InMemoryUsageSessionStore } from './in-memory-store.test-fixture';

/**
 * A usage session store whose every operation is a jest mock that resolves to undefined until a spec says
 * otherwise. Specs arrange business operations ("findPublishedSession returns ..."), not ORM calls.
 */
export function createFakeUsageStore(): jest.Mocked<UsageSessionStore> {
  const mocks = new Map<string | symbol, jest.Mock>();
  return new Proxy({} as jest.Mocked<UsageSessionStore>, {
    get(_target, name) {
      if (name === 'then') return undefined;
      let mock = mocks.get(name);
      if (!mock) {
        mock = jest.fn();
        mocks.set(name, mock);
      }
      return mock;
    },
  });
}

/** A unit of work that runs the work at once, on a scope that runs `afterCommit` callbacks after the work. */
export function createFakeUnitOfWork(): UnitOfWork {
  return {
    run: async (work) => {
      const callbacks: Array<() => void | Promise<void>> = [];
      const scope: TransactionScope = { isOpen: true, afterCommit: (callback) => void callbacks.push(callback) };
      const result = await work(scope);
      for (const callback of callbacks) await callback();
      return result;
    },
    current: () => undefined,
  };
}

/**
 * The real ResourceUsageService and its collaborators on a fake UsageSessionStore and a fake unit of work, with
 * mocked neighbouring services. No ORM is involved.
 */
export async function createFakeStoreUsageScope() {
  return buildUsageScope(createFakeUsageStore(), createFakeUnitOfWork());
}

/**
 * The same service on a stateful in-memory store and the unit of work that belongs to it (a failed change is rolled
 * back), for specs that assert what a business operation left in the store.
 */
export async function createInMemoryUsageScope() {
  const store = new InMemoryUsageSessionStore();
  return buildUsageScope(store, store.unitOfWork());
}

async function buildUsageScope<S extends UsageSessionStore>(store: S, unitOfWork: UnitOfWork) {
  const mocks = {
    resourcesService: { getResourceById: jest.fn() },
    introductions: { hasValidIntroduction: jest.fn(), canGiveIntroductions: jest.fn() },
    introducers: { isIntroducer: jest.fn(), canMaintain: jest.fn() },
    groupIntroductions: { hasValidIntroduction: jest.fn() },
    groupIntroducers: { isIntroducer: jest.fn() },
    groups: { getGroupsOfResource: jest.fn() },
    retraining: {
      isResourceIntroductionBlocked: jest.fn().mockResolvedValue(false),
      isGroupIntroductionBlocked: jest.fn().mockResolvedValue(false),
      getResourceRetrainingStatus: jest.fn().mockResolvedValue({ blocksAccess: false, dueAt: null }),
    },
    maintenance: { hasActiveMaintenance: jest.fn(), canManageMaintenance: jest.fn() },
    health: { isResourceUnhealthy: jest.fn().mockResolvedValue(false) },
    billing: {
      validateResourceUsageStart: jest.fn().mockResolvedValue(undefined),
      getResourceBillingConfiguration: jest.fn(),
      handleResourceUsageStart: jest.fn().mockResolvedValue(undefined),
      chargeForResourceUsage: jest.fn().mockResolvedValue(undefined),
      notifyResourceUsageCharge: jest.fn().mockResolvedValue(undefined),
    },
    projects: { findOneById: jest.fn() },
    forms: { getFormsForAction: jest.fn(), prepareRequiredSubmissions: jest.fn().mockResolvedValue([]) },
    metrics: {
      resourceUsageSessionsTotal: { inc: jest.fn() },
      resourceUsageSessionsActive: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
      resourceUsageDurationSeconds: { observe: jest.fn() },
      authorizationCacheRequestsTotal: { inc: jest.fn() },
      authorizationCacheSize: { set: jest.fn() },
    },
    events: { emit: jest.fn(), emitAsync: jest.fn().mockResolvedValue([]) },
    pluginEvents: { emit: jest.fn(), emitAsync: jest.fn(), onEvent: jest.fn() },
    rbac: { getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()) },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
    flows: { runFlow: jest.fn().mockResolvedValue([]), trackResourceActivity: jest.fn() },
  };
  const module = await Test.createTestingModule({
    providers: [
      ResourceUsageService,
      ...RESOURCE_USAGE_COLLABORATORS,
      { provide: USAGE_SESSION_STORE, useValue: store },
      {
        provide: SESSION_DEADLINE_STORE,
        useValue: { extend: jest.fn(), findOverdue: jest.fn(), findEndingWithin: jest.fn(), claimWarning: jest.fn() },
      },
      { provide: UNIT_OF_WORK, useValue: unitOfWork },
      { provide: ResourcesService, useValue: mocks.resourcesService },
      { provide: ResourceIntroductionsService, useValue: mocks.introductions },
      { provide: ResourceIntroducersService, useValue: mocks.introducers },
      { provide: ResourceGroupsIntroductionsService, useValue: mocks.groupIntroductions },
      { provide: ResourceGroupsIntroducersService, useValue: mocks.groupIntroducers },
      { provide: ResourceGroupsService, useValue: mocks.groups },
      { provide: ResourceRetrainingService, useValue: mocks.retraining },
      { provide: ResourceMaintenanceService, useValue: mocks.maintenance },
      { provide: ResourceHealthService, useValue: mocks.health },
      { provide: BillingService, useValue: mocks.billing },
      { provide: ProjectsService, useValue: mocks.projects },
      { provide: ResourceFormsService, useValue: mocks.forms },
      { provide: MetricsService, useValue: mocks.metrics },
      { provide: EventEmitter2, useValue: mocks.events },
      { provide: PluginEventsService, useValue: mocks.pluginEvents },
      { provide: RbacService, useValue: mocks.rbac },
      { provide: AUDIT_RECORDER, useValue: mocks.audit },
      { provide: ResourceFlowsExecutorService, useValue: mocks.flows },
      { provide: VALKEY_CLIENT, useValue: null },
    ],
  }).compile();
  return { service: module.get(ResourceUsageService), store, ...mocks };
}
