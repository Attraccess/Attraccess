import { BadRequestException, ConflictException } from '@nestjs/common';
import { ResourceType, SupervisionMode } from '@attraccess/application-models';
import type { UsageSessionResource, UsageSessionUser } from '@attraccess/application-models';
import { AlreadyHasActiveSessionError } from '../errors/already-has-active-session.error';
import { ResourceInUseError } from '../errors/resource-in-use.error';
import { createFakeStoreUsageScope } from './fixtures/fake-store.test-fixture';
import { usageInternals } from './fixtures/compose.test-fixture';

describe('ResourceUsageService.precheckStart', () => {
  let scope: Awaited<ReturnType<typeof createFakeStoreUsageScope>>;
  const user = { id: 7 } as UsageSessionUser;
  const machine = (overrides: Partial<UsageSessionResource> = {}) =>
    ({
      id: 3,
      type: ResourceType.Machine,
      supervisionMode: SupervisionMode.NONE,
      allowTakeOver: false,
      ...overrides,
    }) as UsageSessionResource;

  // The mixed-in helpers are exercised elsewhere; here only the refusal order matters.
  type Internals = {
    getResource: jest.Mock;
    canControllResource: jest.Mock;
    validateSupervisedStart: jest.Mock;
    getActiveSession: jest.Mock;
    assertLifecycleAvailable: jest.Mock;
    getSessionLimit: jest.Mock;
  };
  let internals: Internals;

  beforeEach(async () => {
    scope = await createFakeStoreUsageScope();
    const parts = usageInternals(scope.service);
    internals = {
      getResource: jest.spyOn(parts.gate as never, 'getResource').mockResolvedValue(machine() as never) as never,
      canControllResource: jest
        .spyOn(parts.access as never, 'canControllResource')
        .mockResolvedValue(true as never) as never,
      validateSupervisedStart: jest
        .spyOn(parts.gate as never, 'validateSupervisedStart')
        .mockResolvedValue(undefined as never) as never,
      getActiveSession: jest
        .spyOn(parts.records as never, 'getActiveSession')
        .mockResolvedValue(null as never) as never,
      assertLifecycleAvailable: jest
        .spyOn(parts.lifecycle as never, 'assertLifecycleAvailable')
        .mockResolvedValue(undefined as never) as never,
      getSessionLimit: jest.spyOn(parts.lifecycle as never, 'getSessionLimit').mockResolvedValue(1 as never) as never,
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes for a free machine the user may control', async () => {
    await expect(scope.service.precheckStart(3, user, {})).resolves.toBeUndefined();
    expect(internals.getResource).toHaveBeenCalledWith(3, user, {
      checkMaintenance: true,
      checkControlPermission: false,
    });
  });

  it('refuses while another lifecycle operation is in progress, like the real start', async () => {
    internals.assertLifecycleAvailable.mockRejectedValue(new ConflictException('in progress'));
    await expect(scope.service.precheckStart(3, user, {})).rejects.toBeInstanceOf(ConflictException);
    expect(internals.getResource).not.toHaveBeenCalled();
  });

  it('tells the lifecycle check whether the machine is shared, like the real start', async () => {
    await scope.service.precheckStart(3, user, {});
    expect(internals.assertLifecycleAvailable).toHaveBeenLastCalledWith(undefined, 3, false);
    internals.getSessionLimit.mockResolvedValue(2);
    internals.getResource.mockResolvedValue(machine({ maxParallelSessions: 2 }));
    // The caller's own session ends the shared-machine precheck before any slot is counted.
    jest
      .spyOn(usageInternals(scope.service).records as never, 'getActiveSessionsForResource')
      .mockResolvedValue([{ userId: 7 }] as never);
    await expect(scope.service.precheckStart(3, user, {})).rejects.toBeInstanceOf(AlreadyHasActiveSessionError);
    expect(internals.assertLifecycleAvailable).toHaveBeenLastCalledWith(undefined, 3, true);
  });

  it('refuses a user who has not completed the introduction', async () => {
    internals.canControllResource.mockResolvedValue(false);
    await expect(scope.service.precheckStart(3, user, {})).rejects.toThrow(/introduction/);
  });

  it('refuses an unsupervised start when supervision is required', async () => {
    internals.getResource.mockResolvedValue(machine({ supervisionMode: SupervisionMode.SUPERVISION_REQUIRED }));
    await expect(scope.service.precheckStart(3, user, {})).rejects.toThrow(/supervisor/);
  });

  it('validates the supervisor instead of the introduction on a supervised start', async () => {
    internals.canControllResource.mockResolvedValue(false);
    internals.getResource.mockResolvedValue(machine({ supervisionMode: SupervisionMode.SUPERVISION_REQUIRED }));
    await expect(scope.service.precheckStart(3, user, {}, 9)).resolves.toBeUndefined();
    expect(internals.validateSupervisedStart).toHaveBeenCalledWith(3, user, 9, undefined, expect.anything());
    expect(internals.canControllResource).not.toHaveBeenCalled();
  });

  it('refuses a resource that is not a machine', async () => {
    internals.getResource.mockResolvedValue(machine({ type: ResourceType.Door }));
    await expect(scope.service.precheckStart(3, user, {})).rejects.toThrow(BadRequestException);
  });

  it('refuses a resource in use without forceTakeOver', async () => {
    internals.getActiveSession.mockResolvedValue({ id: 1 });
    await expect(scope.service.precheckStart(3, user, {})).rejects.toBeInstanceOf(ResourceInUseError);
  });

  it('refuses a takeover on a resource that does not allow it', async () => {
    internals.getActiveSession.mockResolvedValue({ id: 1 });
    await expect(scope.service.precheckStart(3, user, { forceTakeOver: true })).rejects.toThrow(/overtaking/);
  });

  it('allows a takeover on a resource that allows it', async () => {
    internals.getResource.mockResolvedValue(machine({ allowTakeOver: true }));
    internals.getActiveSession.mockResolvedValue({ id: 1 });
    await expect(scope.service.precheckStart(3, user, { forceTakeOver: true })).resolves.toBeUndefined();
  });
});
