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
    const wall = await service.create({ name: '  Hall A ', selection: selection({ resourceIds: [1, 2] }) });

    expect(wall).toMatchObject({ name: 'Hall A', selection: { all: false, resourceIds: [1, 2], groupIds: [] } });
    expect(wall.token).toMatch(WALL_TOKEN_PATTERN);
    expect((await service.findByToken(wall.token))?.id).toBe(wall.id);
  });

  it('lists walls by name', async () => {
    const { service } = setup();
    await service.create({ name: 'Zeta', selection: selection({ all: true }) });
    await service.create({ name: 'Alpha', selection: selection({ all: true }) });

    expect((await service.list()).map((wall) => wall.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('updates name and selection but keeps the link', async () => {
    const { service, setNow } = setup();
    const wall = await service.create({ name: 'Hall', selection: selection({ all: true }) });
    setNow(new Date('2026-11-21T09:00:00.000Z'));

    const updated = await service.update(wall.id, { name: 'Hall B', selection: selection({ groupIds: [3] }) });

    expect(updated).toMatchObject({ name: 'Hall B', token: wall.token, selection: { all: false, groupIds: [3] } });
    expect(updated.updatedAt).toEqual(new Date('2026-11-21T09:00:00.000Z'));
  });

  it('replaces the link on regenerate, so the old one finds nothing', async () => {
    const { service } = setup();
    const wall = await service.create({ name: 'Hall', selection: selection({ all: true }) });

    const regenerated = await service.regenerateToken(wall.id);

    expect(regenerated.token).not.toBe(wall.token);
    expect(await service.findByToken(wall.token)).toBeNull();
    expect((await service.findByToken(regenerated.token))?.id).toBe(wall.id);
  });

  it('deletes walls and answers 404 for unknown ones', async () => {
    const { service } = setup();
    const wall = await service.create({ name: 'Hall', selection: selection({ all: true }) });

    await service.delete(wall.id);

    expect(await service.findByToken(wall.token)).toBeNull();
    await expect(service.delete(wall.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(wall.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(wall.id, { name: 'x', selection: selection() })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.regenerateToken(wall.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not look up malformed tokens', async () => {
    const { service, memory } = setup();
    await service.create({ name: 'Hall', selection: selection({ all: true }) });

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
