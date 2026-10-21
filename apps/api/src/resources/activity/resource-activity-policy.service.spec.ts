import { ResourceActivityPolicy } from './resource-activity-policy.service';

describe('ResourceActivityPolicy', () => {
  const user = { id: 7 } as never;
  const permissions = new Set<string>();
  const settings = { getActivityVisibility: jest.fn() };
  const rbac = { getEffectivePermissions: jest.fn(async () => permissions) };
  const introductions = { hasValidIntroduction: jest.fn() };
  const introducers = { isIntroducer: jest.fn() };
  const groups = { getGroupsOfResource: jest.fn(async () => [{ id: 3 }]) };
  const groupIntroductions = { hasValidIntroduction: jest.fn() };
  const retraining = { isResourceIntroductionBlocked: jest.fn(), isGroupIntroductionBlocked: jest.fn() };
  const policy = new ResourceActivityPolicy(
    settings as never,
    rbac as never,
    introductions as never,
    introducers as never,
    groups as never,
    groupIntroductions as never,
    retraining as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    permissions.clear();
    settings.getActivityVisibility.mockResolvedValue('all-resources');
    introductions.hasValidIntroduction.mockResolvedValue(false);
    introducers.isIntroducer.mockResolvedValue(false);
    groupIntroductions.hasValidIntroduction.mockResolvedValue(false);
    retraining.isResourceIntroductionBlocked.mockResolvedValue(false);
    retraining.isGroupIntroductionBlocked.mockResolvedValue(false);
  });

  it('denies anonymous and unprivileged readers in broad mode', async () => {
    expect(await policy.canRead(1, undefined)).toBe(false);
    expect(await policy.canRead(1, user)).toBe(false);
    permissions.add('resources.read');
    expect(await policy.canRead(1, user)).toBe(true);
    permissions.delete('resources.read');
    expect(await policy.canRead(1, user)).toBe(false);
    expect(rbac.getEffectivePermissions).toHaveBeenCalledWith(7, true);
  });

  it('does not broaden restricted visibility for resource readers, control or maintenance', async () => {
    settings.getActivityVisibility.mockResolvedValue('introduced-resources');
    permissions.add('resources.read');
    permissions.add('resources.control');
    permissions.add('resources.maintenance.manage');
    await expect(policy.assertRead(1, user)).rejects.toThrow('private');
    permissions.add('resources.access.manage');
    expect(await policy.canRead(1, user)).toBe(true);
  });

  it('allows managers and inherited introducers', async () => {
    permissions.add('resources.update');
    expect(await policy.canRead(1, user)).toBe(true);
    permissions.clear();
    settings.getActivityVisibility.mockResolvedValue('introduced-resources');
    introducers.isIntroducer.mockResolvedValue(true);
    expect(await policy.canRead(1, user)).toBe(true);
    expect(introducers.isIntroducer).toHaveBeenCalledWith(1, 7, true);
  });

  it('applies expiry and retraining to direct and group introductions', async () => {
    settings.getActivityVisibility.mockResolvedValue('introduced-resources');
    introductions.hasValidIntroduction.mockResolvedValue(true);
    expect(await policy.canRead(1, user)).toBe(true);
    retraining.isResourceIntroductionBlocked.mockResolvedValue(true);
    expect(await policy.canRead(1, user)).toBe(false);
    groupIntroductions.hasValidIntroduction.mockResolvedValue(true);
    expect(await policy.canRead(1, user)).toBe(true);
    retraining.isGroupIntroductionBlocked.mockResolvedValue(true);
    expect(await policy.canRead(1, user)).toBe(false);
  });

  it('keeps API token scope narrower than owner permissions', async () => {
    permissions.add('resources.read');
    permissions.add('resources.update');
    expect(await policy.canRead(1, { id: 7, apiTokenId: 5, effectivePermissions: new Set() } as never)).toBe(false);
  });
  it.each(['introducer', 'direct', 'group'])('requires token scope before the owner %s grant', async (grant) => {
    settings.getActivityVisibility.mockResolvedValue('introduced-resources');
    permissions.add('resources.read');
    introducers.isIntroducer.mockResolvedValue(grant === 'introducer');
    introductions.hasValidIntroduction.mockResolvedValue(grant === 'direct');
    groupIntroductions.hasValidIntroduction.mockResolvedValue(grant === 'group');
    const token = { id: 7, apiTokenId: 5, effectivePermissions: new Set<string>() } as unknown as Parameters<
      ResourceActivityPolicy['canRead']
    >[1];
    expect(await policy.canRead(1, token)).toBe(false);
    expect(introducers.isIntroducer).not.toHaveBeenCalled();
    expect(await policy.canRead(1, { ...token, effectivePermissions: new Set(['resources.read']) })).toBe(true);
  });

  it.each(['all-resources', 'introduced-resources'])(
    'loads request-wide context once in %s mode',
    async (visibility) => {
      settings.getActivityVisibility.mockResolvedValue(visibility);
      permissions.add('resources.read');
      introductions.hasValidIntroduction.mockImplementation(async (id) => id % 2 === 0);
      const ids = Array.from({ length: 20 }, (_, i) => i + 1);
      expect(await policy.filterReadable(ids, user)).toEqual(
        visibility === 'all-resources' ? ids : ids.filter((id) => id % 2 === 0),
      );
      expect(rbac.getEffectivePermissions).toHaveBeenCalledTimes(1);
      expect(settings.getActivityVisibility).toHaveBeenCalledTimes(1);
      if (visibility === 'all-resources') expect(introductions.hasValidIntroduction).not.toHaveBeenCalled();
    },
  );
});
