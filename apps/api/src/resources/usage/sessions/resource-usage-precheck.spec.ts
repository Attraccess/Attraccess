import { BadRequestException } from '@nestjs/common';
import { Resource, ResourceType, SupervisionMode, User } from '@attraccess/database-entities';
import { ResourceInUseError } from '../errors/resource-in-use.error';
import { resetTestFixture } from './fixtures/setup.test-fixture';
import { createResourceUsageServiceFixture } from './fixtures/service.test-fixture';

describe('ResourceUsageService.precheckStart', () => {
  const scope = createResourceUsageServiceFixture();
  const user = { id: 7 } as User;
  const machine = (overrides: Partial<Resource> = {}) =>
    ({
      id: 3,
      type: ResourceType.Machine,
      supervisionMode: SupervisionMode.NONE,
      allowTakeOver: false,
      ...overrides,
    }) as Resource;

  // The mixed-in helpers are exercised elsewhere; here only the refusal order matters.
  type Internals = {
    getResource: jest.Mock;
    canControllResource: jest.Mock;
    validateSupervisedStart: jest.Mock;
    getActiveSession: jest.Mock;
  };
  let internals: Internals;

  beforeEach(async () => {
    await resetTestFixture(scope);
    const service = scope.service as unknown as Internals;
    internals = {
      getResource: jest.spyOn(service as never, 'getResource').mockResolvedValue(machine() as never) as never,
      canControllResource: jest
        .spyOn(service as never, 'canControllResource')
        .mockResolvedValue(true as never) as never,
      validateSupervisedStart: jest
        .spyOn(service as never, 'validateSupervisedStart')
        .mockResolvedValue(undefined as never) as never,
      getActiveSession: jest.spyOn(service as never, 'getActiveSession').mockResolvedValue(null as never) as never,
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
