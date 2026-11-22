import { ResourceHealthSource, ResourceHealthStatus } from '@attraccess/application-models';
import type { PluginResourceHealthContext } from '@attraccess/plugins-backend-sdk';
import { ResourceHealthChangedEvent } from '../../resources/health/events/resource-health-changed.event';
import { registerResourceHealthServiceFixture } from '../../resources/health/resource-health.service.resource-health-service.test-fixture';
import { clearAllPluginResourceHealth, createPluginResourceHealthContext } from './plugin-resource-health';

describe('plugin resource health', () => {
  const fixture = registerResourceHealthServiceFixture();
  const events: ResourceHealthChangedEvent[] = [];
  let acme: PluginResourceHealthContext;
  let other: PluginResourceHealthContext;

  beforeEach(() => {
    events.length = 0;
    fixture.eventEmitter.on(ResourceHealthChangedEvent.EVENT_NAME, (event: ResourceHealthChangedEvent) =>
      events.push(event),
    );
    acme = createPluginResourceHealthContext('acme', () => fixture.service);
    other = createPluginResourceHealthContext('other', () => fixture.service);
  });

  const unhealthy = (key: string, reason?: string, resourceId = 1) => ({
    resourceId,
    key,
    status: 'unhealthy' as const,
    reason,
  });

  it('stores the entry under plugin:<name>:<key> with the plugin source and audits the transition', async () => {
    await acme.report(unhealthy('lock-1-motor', '  Motor missing  '));

    expect(fixture.records).toEqual([
      expect.objectContaining({
        resourceId: 1,
        identifier: 'plugin:acme:lock-1-motor',
        source: ResourceHealthSource.PLUGIN,
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'Motor missing',
      }),
    ]);
    expect(events).toHaveLength(1);
    expect(fixture.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'health.transition',
        details: expect.objectContaining({ healthSource: 'plugin' }),
      }),
    );
  });

  it('emits an event only when the status changes', async () => {
    await acme.report(unhealthy('a', 'one'));
    await acme.report(unhealthy('a', 'one again'));
    expect(events).toHaveLength(1);
    expect(fixture.records[0].reason).toBe('one again');

    await acme.report({ resourceId: 1, key: 'a', status: 'healthy', reason: 'ignored' });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ status: ResourceHealthStatus.HEALTHY });
    expect(fixture.records[0].reason).toBeNull();
  });

  it('limits the reason to 500 characters', async () => {
    await acme.report(unhealthy('a', 'x'.repeat(900)));
    expect(fixture.records[0].reason).toHaveLength(500);
  });

  it.each(['', 'Upper', '-a', 'a b', 'a'.repeat(65), 'a:b'])('rejects the key %p', async (key) => {
    await expect(acme.report(unhealthy(key))).rejects.toThrow(/invalid/);
    await expect(acme.clear(1, key)).rejects.toThrow(/invalid/);
    expect(fixture.records).toEqual([]);
  });

  it('skips an unknown resource', async () => {
    await expect(acme.report(unhealthy('a', 'x', 999))).resolves.toBeUndefined();
    await expect(acme.clear(999, 'a')).resolves.toBeUndefined();
    expect(fixture.records).toEqual([]);
    expect(events).toEqual([]);
  });

  it('clear removes the own unhealthy entry and emits the recovery; a missing entry is a no-op', async () => {
    await acme.clear(1, 'a');
    expect(events).toEqual([]);

    await acme.report(unhealthy('a', 'x'));
    await acme.clear(1, 'a');
    expect(fixture.records).toEqual([]);
    expect(events.map((event) => event.status)).toEqual([ResourceHealthStatus.UNHEALTHY, ResourceHealthStatus.HEALTHY]);
  });

  it('never touches manual, other-plugin or look-alike entries, and a manual unhealthy entry survives', async () => {
    await fixture.service.reportHealth({
      resourceId: 1,
      identifier: 'door',
      status: ResourceHealthStatus.UNHEALTHY,
      reason: 'broken by admin',
      source: ResourceHealthSource.MANUAL,
    });
    await fixture.service.reportHealth({
      resourceId: 1,
      identifier: 'plugin:acme:fake',
      status: ResourceHealthStatus.UNHEALTHY,
      reason: 'flow node',
      source: ResourceHealthSource.MANUAL,
    });
    await other.report(unhealthy('a', 'theirs'));
    await acme.report(unhealthy('a', 'ours'));
    events.length = 0;

    await acme.report(unhealthy('fake', 'overwrite attempt'));
    await acme.clear(1, 'fake');
    await acme.clear(1, 'a');
    await clearAllPluginResourceHealth('acme', fixture.service);

    expect(fixture.records.map((record) => [record.identifier, record.source, record.reason])).toEqual([
      ['door', 'manual', 'broken by admin'],
      ['plugin:acme:fake', 'manual', 'flow node'],
      ['plugin:other:a', 'plugin', 'theirs'],
    ]);
    expect(await acme.list()).toEqual([]);
    expect(await fixture.service.isResourceUnhealthy(1)).toBe(true);
  });

  it('lists only the own entries, optionally of one resource', async () => {
    await acme.report(unhealthy('a', 'x', 1));
    await acme.report(unhealthy('b', 'y', 2));
    await other.report(unhealthy('a', 'theirs', 1));
    await fixture.service.reportHealth({
      resourceId: 1,
      identifier: 'plugin:acme:manual',
      status: ResourceHealthStatus.UNHEALTHY,
      source: ResourceHealthSource.MANUAL,
    });

    expect((await acme.list()).map((entry) => [entry.resourceId, entry.key, entry.status, entry.reason])).toEqual([
      [1, 'a', 'unhealthy', 'x'],
      [2, 'b', 'unhealthy', 'y'],
    ]);
    expect((await acme.list(2)).map((entry) => entry.key)).toEqual(['b']);
    expect((await acme.list())[0].lastReportedAt).toBeInstanceOf(Date);
  });

  it('clears every entry of a plugin on uninstall and emits recoveries', async () => {
    await acme.report(unhealthy('a', 'x', 1));
    await acme.report(unhealthy('b', 'y', 2));
    await other.report(unhealthy('a', 'theirs', 1));
    events.length = 0;

    await expect(clearAllPluginResourceHealth('acme', fixture.service)).resolves.toBe(2);

    expect(fixture.records.map((record) => record.identifier)).toEqual(['plugin:other:a']);
    expect(events.map((event) => event.status)).toEqual([ResourceHealthStatus.HEALTHY, ResourceHealthStatus.HEALTHY]);
  });
});
