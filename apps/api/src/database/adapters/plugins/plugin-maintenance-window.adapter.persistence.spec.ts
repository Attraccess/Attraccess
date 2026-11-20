import { Resource, ResourceMaintenance } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { createPluginMaintenanceWindows } from './plugin-maintenance-window.adapter';

describe('plugin maintenance window adapter on a real database', () => {
  let source: DataSource;
  let resourceId: number;

  beforeEach(async () => {
    source = await createTestDataSource({ synchronize: true });
    resourceId = (await source.getRepository(Resource).save({ name: 'Laser', type: ResourceType.Machine })).id;
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  const windows = () => createPluginMaintenanceWindows(() => source);

  it('returns the start and end of a finished window as dates', async () => {
    const { id } = await source.getRepository(ResourceMaintenance).save({
      resourceId,
      startTime: new Date('2026-11-17T08:00:00.000Z'),
      endTime: new Date('2026-11-17T10:30:00.000Z'),
      reason: 'Lens cleaning',
    });

    expect(await windows().findWindow(id)).toEqual({
      startTime: new Date('2026-11-17T08:00:00.000Z'),
      endTime: new Date('2026-11-17T10:30:00.000Z'),
    });
  });

  it('reports a window that is still open with a null end', async () => {
    const { id } = await source
      .getRepository(ResourceMaintenance)
      .save({ resourceId, startTime: new Date('2026-11-17T08:00:00.000Z'), endTime: null });

    expect(await windows().findWindow(id)).toEqual({ startTime: new Date('2026-11-17T08:00:00.000Z'), endTime: null });
  });

  it('answers null for an unknown window', async () => {
    expect(await windows().findWindow(404)).toBeNull();
  });

  it('resolves the connection on every call, so it works when the host connection is created later', async () => {
    const host: { connection?: DataSource } = {};
    const lazy = createPluginMaintenanceWindows(() => {
      if (!host.connection) throw new Error('Host DataSource is not available yet');
      return host.connection;
    });
    await expect(lazy.findWindow(1)).rejects.toThrow(/not available yet/);
    host.connection = source;
    expect(await lazy.findWindow(1)).toBeNull();
  });
});
