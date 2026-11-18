import 'reflect-metadata';
import {
  ReaderUiAlert,
  ReaderUiPluginSettings,
  ReaderUiReaderSettings,
  ReaderUiResourceSettings,
  entities,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import * as migrations from '../../migrations';
import { ReaderUiAlertsAdapter } from './reader-ui-alerts.adapter';
import { ReaderUiSettingsAdapter } from './reader-ui-settings.adapter';

describe('reader UI persistence adapters on a real database', () => {
  let source: DataSource;
  let alerts: ReaderUiAlertsAdapter;
  let settings: ReaderUiSettingsAdapter;

  beforeEach(async () => {
    source = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    alerts = new ReaderUiAlertsAdapter(source.getRepository(ReaderUiAlert));
    settings = new ReaderUiSettingsAdapter(
      source.getRepository(ReaderUiResourceSettings),
      source.getRepository(ReaderUiPluginSettings),
      source.getRepository(ReaderUiReaderSettings),
    );
  });

  afterEach(async () => {
    await source.destroy();
  });

  describe('alerts', () => {
    it('opens an alert, finds it by exact scope and lists open alerts newest first', async () => {
      const first = await alerts.open({ kind: 'breaker-open', message: 'down', plugin: 'p', readerId: null });
      const second = await alerts.open({ kind: 'crash-loop', message: 'PANIC', plugin: null, readerId: 5 });
      expect(first).toMatchObject({ kind: 'breaker-open', plugin: 'p', readerId: null, clearedAt: null });
      expect(first.createdAt).toBeInstanceOf(Date);

      expect((await alerts.listOpenInScope('breaker-open', { plugin: 'p' })).map((a) => a.id)).toEqual([first.id]);
      expect(await alerts.listOpenInScope('breaker-open', { plugin: 'other' })).toEqual([]);
      // An omitted scope part matches alerts without it only.
      expect(await alerts.listOpenInScope('breaker-open', {})).toEqual([]);
      expect((await alerts.listOpenInScope('crash-loop', { readerId: 5 })).map((a) => a.id)).toEqual([second.id]);
      expect((await alerts.listOpen()).map((a) => a.id).sort()).toEqual([first.id, second.id].sort());
    });

    it('clears an alert once, records who cleared it and drops it from the open set', async () => {
      const alert = await alerts.open({ kind: 'load-failure', message: 'boom', plugin: 'p', readerId: null });
      const cleared = await alerts.clear(alert.id, 9);
      expect(cleared).toMatchObject({ id: alert.id, clearedByUserId: 9 });
      expect(cleared.clearedAt).toBeInstanceOf(Date);
      expect(await alerts.findOpen(alert.id)).toBeNull();
      expect(await alerts.listOpen()).toEqual([]);
      await expect(alerts.clear(12345, null)).rejects.toThrow();
    });
  });

  describe('settings', () => {
    it('defaults to nothing stored and writes each level independently', async () => {
      expect(await settings.getNoScreenPolicy(1)).toBeNull();
      expect(await settings.getReaderWidgetsEnabled(2)).toBeNull();
      expect(await settings.getPluginSetting(1, 'res')).toBeNull();
      expect(await settings.listPluginSettings(1)).toEqual([]);

      await settings.setNoScreenPolicy(1, 'card-confirm');
      await settings.setNoScreenPolicy(1, null);
      expect(await settings.getNoScreenPolicy(1)).toBeNull();
      await settings.setNoScreenPolicy(1, 'allow-with-warning');
      expect(await settings.getNoScreenPolicy(1)).toBe('allow-with-warning');

      await settings.setReaderWidgetsEnabled(2, false);
      expect(await settings.getReaderWidgetsEnabled(2)).toBe(false);
    });

    it('upserts plugin settings, lists them by plugin and finds the switched-off ones', async () => {
      await settings.setPluginSetting({
        resourceId: 1,
        plugin: 'b',
        widgetsEnabled: false,
        hookFailurePolicy: 'fail-open',
      });
      await settings.setPluginSetting({
        resourceId: 1,
        plugin: 'a',
        widgetsEnabled: true,
        hookFailurePolicy: 'fail-closed',
      });
      await settings.setPluginSetting({
        resourceId: 2,
        plugin: 'a',
        widgetsEnabled: false,
        hookFailurePolicy: 'fail-closed',
      });
      // A second write updates the row instead of adding one.
      await settings.setPluginSetting({
        resourceId: 1,
        plugin: 'a',
        widgetsEnabled: true,
        hookFailurePolicy: 'fail-open',
      });

      expect((await settings.listPluginSettings(1)).map((row) => row.plugin)).toEqual(['a', 'b']);
      expect(await settings.getPluginSetting(1, 'a')).toEqual({
        resourceId: 1,
        plugin: 'a',
        widgetsEnabled: true,
        hookFailurePolicy: 'fail-open',
      });
      const off = await settings.listDisabledPluginSettings([1, 2, 3]);
      expect(off.map((row) => `${row.resourceId}|${row.plugin}`).sort()).toEqual(['1|b', '2|a']);
      expect(await settings.listDisabledPluginSettings([])).toEqual([]);
    });
  });
});
