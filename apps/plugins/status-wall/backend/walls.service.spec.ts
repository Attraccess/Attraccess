import { NotFoundException } from '@nestjs/common';
import { createFakeContext } from './fake-context.test-utils';
import { parseSelection, WALL_TOKEN_PATTERN, WallsService } from './walls.service';

const selection = (overrides: Partial<{ all: boolean; resourceIds: number[]; groupIds: number[] }> = {}) => ({
  all: false,
  resourceIds: [],
  groupIds: [],
  ...overrides,
});

function setup() {
  const fake = createFakeContext();
  let now = new Date('2026-11-21T08:00:00.000Z');
  const service = new WallsService(fake.context, () => now);
  return { ...fake, service, setNow: (next: Date) => (now = next) };
}

describe('WallsService', () => {
  it('creates a wall with a trimmed name and a fresh secret token, and finds it by that token', async () => {
    const { service } = setup();
    const wall = await service.create(1, { name: '  Hall A ', selection: selection({ resourceIds: [1, 2] }) });

    expect(wall).toMatchObject({ name: 'Hall A', selection: { all: false, resourceIds: [1, 2], groupIds: [] } });
    expect(wall.token).toMatch(WALL_TOKEN_PATTERN);
    expect((await service.findByToken(wall.token))?.id).toBe(wall.id);
  });

  it('lists walls by name', async () => {
    const { service } = setup();
    await service.create(1, { name: 'Zeta', selection: selection({ all: true }) });
    await service.create(1, { name: 'Alpha', selection: selection({ all: true }) });

    expect((await service.list()).map((wall) => wall.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('updates name and selection but keeps the link', async () => {
    const { service, setNow, state } = setup();
    state.groups.set(3, []);
    const wall = await service.create(1, { name: 'Hall', selection: selection({ all: true }) });
    setNow(new Date('2026-11-21T09:00:00.000Z'));

    const updated = await service.update(1, wall.id, { name: 'Hall B', selection: selection({ groupIds: [3] }) });

    expect(updated).toMatchObject({ name: 'Hall B', token: wall.token, selection: { all: false, groupIds: [3] } });
    expect(updated.updatedAt).toEqual(new Date('2026-11-21T09:00:00.000Z'));
  });

  it('replaces the link on regenerate, so the old one finds nothing', async () => {
    const { service } = setup();
    const wall = await service.create(1, { name: 'Hall', selection: selection({ all: true }) });

    const regenerated = await service.regenerateToken(wall.id);

    expect(regenerated.token).not.toBe(wall.token);
    expect(await service.findByToken(wall.token)).toBeNull();
    expect((await service.findByToken(regenerated.token))?.id).toBe(wall.id);
  });

  it('deletes walls and answers 404 for unknown ones', async () => {
    const { service } = setup();
    const wall = await service.create(1, { name: 'Hall', selection: selection({ all: true }) });

    await service.delete(wall.id);

    expect(await service.findByToken(wall.token)).toBeNull();
    await expect(service.delete(wall.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(wall.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(1, wall.id, { name: 'x', selection: selection() })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.regenerateToken(wall.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not look up malformed tokens', async () => {
    const { service, memory } = setup();
    await service.create(1, { name: 'Hall', selection: selection({ all: true }) });

    expect(await service.findByToken('short')).toBeNull();
    expect(await service.findByToken('x'.repeat(20) + '/')).toBeNull();
    expect(memory.rows('walls')).toHaveLength(1);
  });

  it('resolves the shown resources: everything, or the listed ones plus the members of the listed groups', async () => {
    const { service, state } = setup();
    state.groups.set(7, [2, 3]);

    expect(await service.resourceIdsOf(selection({ all: true, resourceIds: [1] }))).toBeUndefined();
    expect(await service.resourceIdsOf(selection({ resourceIds: [1, 2], groupIds: [7] }))).toEqual([1, 2, 3]);
  });
});

describe('WallsService selection and machine list visibility (ATT-1407)', () => {
  const hiddenMachine = { status: 404, response: { message: 'ResourceNotFoundException' } };
  const hiddenGroup = { status: 404, response: { message: 'ResourceGroupNotFound' } };
  const wallWith = (patch: Parameters<typeof selection>[0]) => ({ name: 'Hall', selection: selection(patch) });

  it('refuses a hidden resource on create and on update, and stores nothing of it', async () => {
    const { service, state, memory } = setup();
    state.hiddenResources.add(2);
    await expect(service.create(1, wallWith({ resourceIds: [1, 2] }))).rejects.toMatchObject(hiddenMachine);
    expect(memory.rows('walls')).toHaveLength(0);

    const wall = await service.create(1, wallWith({ resourceIds: [1] }));
    await expect(service.update(1, wall.id, wallWith({ resourceIds: [1, 2] }))).rejects.toMatchObject(hiddenMachine);
    expect((await service.get(wall.id)).selection.resourceIds).toEqual([1]);
  });

  it('refuses a stored resource that is hidden from the editing manager, but not a deleted one', async () => {
    const { service, state } = setup();
    const wall = await service.create(1, wallWith({ resourceIds: [1, 2] }));
    const same = wallWith({ resourceIds: [1, 2] });

    state.hiddenResources.add(2);
    await expect(service.update(1, wall.id, same)).rejects.toMatchObject(hiddenMachine);

    state.hiddenResources.clear();
    state.deletedResources.add(2);
    await expect(service.update(1, wall.id, same)).resolves.toMatchObject({ id: wall.id });
    await expect(service.create(1, same)).rejects.toMatchObject(hiddenMachine);
  });

  it('allows "all" only to a manager whose machine list is not narrowed', async () => {
    const { service, state } = setup();
    const wall = await service.create(1, wallWith({ all: true }));
    state.listScope = 'permitted';

    const narrowed = { status: 403, response: expect.objectContaining({ message: 'ResourceListNarrowed' }) };
    await expect(service.create(1, wallWith({ all: true }))).rejects.toMatchObject(narrowed);
    await expect(service.update(1, wall.id, wallWith({ all: true }))).rejects.toMatchObject(narrowed);
    await expect(service.create(1, wallWith({ resourceIds: [1] }))).resolves.toBeDefined();
  });

  it('ignores the lists while "all" is on, and checks them again once it is switched off', async () => {
    const { service, state } = setup();
    state.groups.set(7, [3]);
    const lists = { resourceIds: [2], groupIds: [7] };
    const wall = await service.create(1, wallWith(lists));
    state.hiddenResources.add(2);
    state.hiddenGroups.add(7);

    await expect(service.update(1, wall.id, wallWith({ all: true, ...lists }))).resolves.toMatchObject({
      selection: { all: true, ...lists },
    });
    await expect(service.create(1, wallWith({ all: true, ...lists }))).resolves.toBeDefined();

    // Being stored with "all" does not make a hidden entry selectable.
    await expect(service.update(1, wall.id, wallWith({ resourceIds: [2] }))).rejects.toMatchObject(hiddenMachine);
    await expect(service.update(1, wall.id, wallWith({ groupIds: [7] }))).rejects.toMatchObject(hiddenGroup);
  });

  it('follows the host group rule: a hidden group answers like a missing one', async () => {
    const { service, state } = setup();
    state.groups.set(7, [2]);
    const wall = await service.create(1, wallWith({ groupIds: [7] }));
    state.hiddenGroups.add(7);

    await expect(service.create(1, wallWith({ groupIds: [7] }))).rejects.toMatchObject(hiddenGroup);
    await expect(service.update(1, wall.id, wallWith({ groupIds: [7] }))).rejects.toMatchObject(hiddenGroup);
    // A group that never existed is refused the same way.
    await expect(service.create(1, wallWith({ groupIds: [404] }))).rejects.toMatchObject(hiddenGroup);
    await expect(service.update(1, wall.id, wallWith({ groupIds: [404] }))).rejects.toMatchObject(hiddenGroup);

    // Deleted since (it shows nothing): the wall stays editable.
    state.groups.delete(7);
    await expect(service.update(1, wall.id, wallWith({ groupIds: [7] }))).resolves.toMatchObject({ id: wall.id });
  });

  it('passes the request user to the host, so an API token scope applies', async () => {
    const { service, context, state } = setup();
    state.groups.set(2, []);
    const viewer = { id: 4, effectivePermissions: new Set(['status-wall.manage']) };
    await service.create(viewer, wallWith({ resourceIds: [1], groupIds: [2] }));
    expect(context.resourceAccess.filterVisible).toHaveBeenCalledWith(viewer, [1]);
    expect(context.resourceAccess.filterVisibleGroups).toHaveBeenCalledWith(viewer, [2]);
  });
});

describe('parseSelection', () => {
  it('shows nothing for malformed values rather than everything', () => {
    expect(parseSelection(null)).toEqual({ all: false, resourceIds: [], groupIds: [] });
    expect(parseSelection({ all: 'yes', resourceIds: [1, 1, -2, 'x', 2.5, 3], groupIds: 'nope' })).toEqual({
      all: false,
      resourceIds: [1, 3],
      groupIds: [],
    });
  });
});
