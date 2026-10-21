import { ResourceMaintenance } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { formatDbDate, TypeormMaintenanceEvaluationPersistence } from './typeorm-adapter';

// Query encoding and SQLite limits are backend concerns, separate from schedule policy.
describe('SQLite maintenance evaluation queries', () => {
  const createdAt = new Date('2024-01-01T00:00:00.000Z');
  const now = new Date('2026-01-01T00:00:00.000Z');
  function fixture() {
    const query = jest.fn().mockResolvedValue([]);
    const persistence = new TypeormMaintenanceEvaluationPersistence({
      getRepository: (entity: unknown) => ({
        metadata: { tableName: entity === ResourceMaintenance ? 'resource_maintenance' : 'resource_usage' },
        query,
      }),
    } as unknown as EntityManager);
    return { query, persistence };
  }
  it('chunks usage-count queries below the SQLite bind limit', async () => {
    const { query, persistence } = fixture();
    const pairs = Array.from({ length: 10_922 }, (_, index) => ({
      resourceId: index + 1,
      scheduleId: index + 1,
      createdAt,
    }));
    await persistence.scheduleState(pairs, now, true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map(([, params]) => params.length)).toEqual([32_764, 4]);
  });
  it('encodes independent cycle baselines and normalizes state without reading usage for duration schedules', async () => {
    const { query, persistence } = fixture();
    query.mockResolvedValue([
      { resourceId: 1, scheduleId: 2, baseline: formatDbDate(createdAt), hasActiveMaintenance: 1 },
    ]);
    expect(await persistence.scheduleState([{ resourceId: 1, scheduleId: 2, createdAt }], now, false)).toEqual([
      { resourceId: 1, scheduleId: 2, baseline: createdAt, hasActiveMaintenance: true },
    ]);
    expect(query.mock.calls[0][0]).toContain('resource_maintenance');
    expect(query.mock.calls[0][0]).not.toContain('resource_usage');
    expect(query.mock.calls[0][1]).toEqual([1, 2, formatDbDate(createdAt), formatDbDate(now)]);
    query.mockClear();
    await persistence.scheduleState([], now, true);
    expect(query).not.toHaveBeenCalled();
  });
});
