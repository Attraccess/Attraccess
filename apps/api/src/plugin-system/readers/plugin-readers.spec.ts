/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import {
  PLUGIN_READER_LIMITS,
  PluginPermission,
  PluginPermissionError,
  PluginReaderError,
  PluginReadersContext,
} from '@attraccess/plugins-backend-sdk';
import { projectAuditRow } from '../../audit/recorder/audit-row';
import { ExternalEffectFailureError } from '../../resources/flows/errors/external-effect-failure.error';
import { FlowExecutionError } from '../../resources/flows/errors/flow-execution.error';
import { ResourceSessionStartedEvent } from '../../resources/usage/events/resource-usage.events';
import { registerPluginModuleFixture } from '../plugin.module.plugin-module.test-fixture';
import { PLUGIN_CARD_AUTHENTICATION_LIMITS } from './plugin-card-authentications';
import { createPluginReadersHost } from './plugin-readers.test-fixture';

// Real plugin ids are 21 base64url characters (the audit policy checks that).
const PLUGIN_A = 'pluginAAAAAAAAAAAAAAA';
const PLUGIN_B = 'pluginBBBBBBBBBBBBBBB';
const DOOR_READER = { resourceTypes: ['door'], actions: ['open'] } as const;

const reader = (deviceId = 'device-1', name = 'Side entrance') => ({
  deviceId,
  name,
  capabilities: { resourceTypes: [...DOOR_READER.resourceTypes], actions: [...DOOR_READER.actions] },
});

const rejectsWith = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(PluginReaderError);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('context.readers', () => {
  const fixture = registerPluginModuleFixture();
  let host: Awaited<ReturnType<typeof createPluginReadersHost>>;
  let readers: PluginReadersContext;

  beforeEach(async () => {
    host = await createPluginReadersHost(fixture.manifest);
    readers = host.contextOf(PLUGIN_A, [PluginPermission.READER_DEVICES]).readers;
  });

  afterEach(() => jest.useRealTimers());

  describe('permission', () => {
    it('is guarded by READER_DEVICES', () => {
      const context = host.contextOf(PLUGIN_A, [PluginPermission.CARD_AUTHENTICATION]);

      expect(() => context.readers).toThrow(PluginPermissionError);
      expect(() => context.readers).toThrow(/READER_DEVICES/);
    });
  });

  describe('management', () => {
    it('registers a reader without a resource', async () => {
      const registered = await readers.register(reader());

      expect(registered).toEqual({
        deviceId: 'device-1',
        name: 'Side entrance',
        capabilities: DOOR_READER,
        resourceId: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(await readers.get('device-1')).toEqual(registered);
      expect(await readers.get('unknown')).toBeNull();
    });

    it('updates name and capabilities of a reader registered again, keeping its assignment', async () => {
      const door = await host.createDoor();
      await readers.register(reader());
      await readers.assignResource('device-1', door.id);

      const again = await readers.register(reader('device-1', 'Renamed'));

      expect(again).toMatchObject({ name: 'Renamed', resourceId: door.id });
      expect(await readers.list()).toHaveLength(1);
    });

    it.each([
      ['an empty device id', { ...reader(), deviceId: '' }],
      ['a device id over the limit', { ...reader(), deviceId: 'x'.repeat(PLUGIN_READER_LIMITS.deviceIdMaxLength + 1) }],
      ['a non-string device id', { ...reader(), deviceId: 5 }],
      ['a blank name', { ...reader(), name: '  ' }],
      ['a name over the limit', { ...reader(), name: 'x'.repeat(PLUGIN_READER_LIMITS.nameMaxLength + 1) }],
      ['no capabilities', { ...reader(), capabilities: undefined }],
      ['empty resource types', { ...reader(), capabilities: { resourceTypes: [], actions: ['open'] } }],
      ['empty actions', { ...reader(), capabilities: { resourceTypes: ['door'], actions: [] } }],
      ['an unknown resource type', { ...reader(), capabilities: { resourceTypes: ['machine'], actions: ['open'] } }],
      ['an unknown action', { ...reader(), capabilities: { resourceTypes: ['door'], actions: ['unlock'] } }],
      ['a duplicate action', { ...reader(), capabilities: { resourceTypes: ['door'], actions: ['open', 'open'] } }],
      ['a duplicate type', { ...reader(), capabilities: { resourceTypes: ['door', 'door'], actions: ['open'] } }],
    ])('refuses %s', async (_label, input) => {
      await rejectsWith(readers.register(input as any), 'INVALID_ARGUMENT');
      expect(await readers.list()).toEqual([]);
    });

    it('refuses a reader over the limit', async () => {
      const rows = Array.from({ length: PLUGIN_READER_LIMITS.maxReaders }, (_, index) => ({
        pluginId: PLUGIN_A,
        deviceId: `d${index}`,
        name: 'r',
        capabilities: { resourceTypes: [...DOOR_READER.resourceTypes], actions: [...DOOR_READER.actions] },
      }));
      await host.database.insertReaders(rows);

      await rejectsWith(readers.register(reader('one-more')), 'LIMIT_REACHED');
      // Registering an existing device again is an update, not a new reader.
      await expect(readers.register(reader('d0', 'renamed'))).resolves.toMatchObject({ name: 'renamed' });
    });

    it('lists, gets and changes only the calling plugin readers', async () => {
      const other = host.contextOf(PLUGIN_B, [PluginPermission.READER_DEVICES]).readers;
      await readers.register(reader('shared-id', 'A'));
      await other.register(reader('shared-id', 'B'));
      await other.register(reader('only-b', 'B2'));

      expect((await readers.list()).map((entry) => entry.name)).toEqual(['A']);
      expect((await other.list()).map((entry) => entry.name)).toEqual(['B', 'B2']);
      expect(await readers.get('only-b')).toBeNull();
      await rejectsWith(readers.update('only-b', { name: 'x' }), 'READER_NOT_FOUND');
      await readers.remove('only-b');
      expect(await other.get('only-b')).not.toBeNull();
    });

    it('removes a reader idempotently', async () => {
      await readers.register(reader());

      await readers.remove('device-1');
      await readers.remove('device-1');

      expect(await readers.list()).toEqual([]);
    });

    it('validates updates', async () => {
      await readers.register(reader());

      await rejectsWith(readers.update('device-1', { name: '' }), 'INVALID_ARGUMENT');
      await rejectsWith(readers.update('device-1', null as any), 'INVALID_ARGUMENT');
      await rejectsWith(readers.update('missing', { name: 'x' }), 'READER_NOT_FOUND');
      await expect(readers.update('device-1', { name: 'New name' })).resolves.toMatchObject({ name: 'New name' });
    });
  });

  describe('assignment', () => {
    it('assigns an access-only door and unassigns it idempotently', async () => {
      const door = await host.createDoor();
      await readers.register(reader());

      await expect(readers.assignResource('device-1', door.id)).resolves.toMatchObject({ resourceId: door.id });
      await expect(readers.unassignResource('device-1')).resolves.toMatchObject({ resourceId: null });
      await expect(readers.unassignResource('device-1')).resolves.toMatchObject({ resourceId: null });
    });

    it('refuses a door that is not access only and a machine', async () => {
      const door = await host.createDoor({ accessOnly: false });
      const machine = await host.createDoor({ type: ResourceType.Machine, accessOnly: false });
      await readers.register(reader());

      await rejectsWith(readers.assignResource('device-1', door.id), 'RESOURCE_NOT_ALLOWED');
      await rejectsWith(readers.assignResource('device-1', machine.id), 'RESOURCE_NOT_ALLOWED');
      expect(await readers.get('device-1')).toMatchObject({ resourceId: null });
    });

    it('refuses an unknown resource, an unknown reader and an invalid resource id', async () => {
      const door = await host.createDoor();
      await readers.register(reader());

      await rejectsWith(readers.assignResource('device-1', 9999), 'RESOURCE_NOT_FOUND');
      await rejectsWith(readers.assignResource('missing', door.id), 'READER_NOT_FOUND');
      await rejectsWith(readers.assignResource('device-1', 1.5), 'INVALID_ARGUMENT');
      await rejectsWith(readers.assignResource('device-1', '1' as any), 'INVALID_ARGUMENT');
      await rejectsWith(readers.unassignResource('missing'), 'READER_NOT_FOUND');
    });

    it('unassigns a resource that the updated capabilities no longer allow', async () => {
      const door = await host.createDoor();
      await readers.register(reader());
      await readers.assignResource('device-1', door.id);
      // Today's SDK has a single capability set, so the door changes instead: no capability allows it any more.
      await host.database.setAccessOnly(door.id, false);

      await expect(
        readers.update('device-1', { capabilities: { resourceTypes: ['door'], actions: ['open'] } }),
      ).resolves.toMatchObject({ resourceId: null });
    });

    it('keeps an assignment that the new capabilities still allow', async () => {
      const door = await host.createDoor();
      await readers.register(reader());
      await readers.assignResource('device-1', door.id);

      await expect(
        readers.update('device-1', { capabilities: { resourceTypes: ['door'], actions: ['open'] } }),
      ).resolves.toMatchObject({ resourceId: door.id });
    });

    it('drops the assignment when the resource is deleted', async () => {
      const door = await host.createDoor();
      await readers.register(reader());
      await readers.assignResource('device-1', door.id);

      await host.database.deleteResource(door.id);

      expect(await readers.get('device-1')).toMatchObject({ resourceId: null });
    });
  });

  describe('tap', () => {
    const setUp = async () => {
      const door = await host.createDoor();
      const user = await host.createUser();
      await readers.register(reader());
      await readers.assignResource('device-1', door.id);
      return { door, user };
    };

    it('opens the door for the card owner, records a door unlock and fires the door-unlocked flow', async () => {
      const { door, user } = await setUp();

      const result = await readers.tap({
        deviceId: 'device-1',
        authentication: host.authenticate(PLUGIN_A, 'device-1', user.id),
      });

      expect(result).toEqual({ ok: true, action: 'open', resourceId: door.id, userId: user.id });
      expect(await host.doorActions()).toEqual([
        expect.objectContaining({ resourceId: door.id, userId: user.id, usageAction: ResourceUsageAction.DoorUnlock }),
      ]);
      // The event the door-unlocked flow trigger listens to (see access-only-doors.spec.ts for the trigger).
      const [eventName, event] = host.emitAsync.mock.calls[0];
      expect(eventName).toBe(ResourceSessionStartedEvent.EVENT_NAME);
      expect((event as ResourceSessionStartedEvent).usage).toMatchObject({
        resourceId: door.id,
        usageAction: ResourceUsageAction.DoorUnlock,
      });
      expect(host.usage.openDoor).toHaveBeenCalledWith(door.id, expect.objectContaining({ id: user.id }));
    });

    it('audits an accepted tap without the handle', async () => {
      const { door, user } = await setUp();
      const authentication = host.authenticate(PLUGIN_A, 'device-1', user.id);

      await readers.tap({ deviceId: 'device-1', authentication });

      expect(host.audited).toEqual([
        {
          domain: 'attractap',
          action: 'attractap.plugin_reader.tapped',
          actor: { id: null, authenticationMethod: null },
          subject: { type: 'attractap.plugin-reader', id: expect.any(Number) },
          details: {
            pluginId: PLUGIN_A,
            deviceId: 'device-1',
            subjectLabel: 'Side entrance',
            result: 'accepted',
            resourceId: door.id,
            cardId: host.cardOf(user.id),
            userId: user.id,
          },
        },
      ]);
      expect(JSON.stringify(host.audited)).not.toContain(authentication);
      // The core audit policy stores it as is.
      expect(projectAuditRow(host.audited[0])).toMatchObject({
        domain: 'attractap',
        pluginId: 'core',
        action: 'attractap.plugin_reader.tapped',
        subjectType: 'attractap.plugin-reader',
        details: host.audited[0].details,
      });
    });

    it('spends the authentication: a second tap with it is invalid', async () => {
      const { user } = await setUp();
      const authentication = host.authenticate(PLUGIN_A, 'device-1', user.id);

      await readers.tap({ deviceId: 'device-1', authentication });
      const again = await readers.tap({ deviceId: 'device-1', authentication });

      expect(again).toEqual({ ok: false, reason: 'AUTHENTICATION_INVALID' });
      expect(await host.doorActions()).toHaveLength(1);
    });

    it('refuses an expired authentication and spends it', async () => {
      const { user } = await setUp();
      const issuedAt = Date.now();
      host.authentications.now = () => issuedAt;
      const authentication = host.authenticate(PLUGIN_A, 'device-1', user.id);
      host.authentications.now = () => issuedAt + PLUGIN_READER_LIMITS.authenticationTtlMs + 1;

      expect(await readers.tap({ deviceId: 'device-1', authentication })).toEqual({
        ok: false,
        reason: 'AUTHENTICATION_EXPIRED',
      });
      expect(await readers.tap({ deviceId: 'device-1', authentication })).toEqual({
        ok: false,
        reason: 'AUTHENTICATION_INVALID',
      });
      expect(await host.doorActions()).toEqual([]);
    });

    it('refuses an authentication from another device or plugin, and an unknown one', async () => {
      const { user } = await setUp();
      await readers.register(reader('device-2'));

      const tap = (authentication: string) => readers.tap({ deviceId: 'device-1', authentication });

      expect(await tap(host.authenticate(PLUGIN_A, 'device-2', user.id))).toMatchObject({
        reason: 'AUTHENTICATION_INVALID',
      });
      expect(await tap(host.authenticate(PLUGIN_B, 'device-1', user.id))).toMatchObject({
        reason: 'AUTHENTICATION_INVALID',
      });
      expect(await tap('not-a-handle')).toMatchObject({ reason: 'AUTHENTICATION_INVALID' });
      expect(await tap('x'.repeat(1000))).toMatchObject({ reason: 'AUTHENTICATION_INVALID' });
      expect(await host.doorActions()).toEqual([]);
      // Refusals are audited too, without a card the authentication did not prove.
      expect(host.audited.map((event) => event.details)).toEqual(
        Array.from({ length: 4 }, () =>
          expect.objectContaining({ result: 'refused', reasonCode: 'AUTHENTICATION_INVALID' }),
        ),
      );
      expect(host.audited.every((event) => !('cardId' in event.details))).toBe(true);
    });

    it('refuses a reader without a resource and an unknown reader', async () => {
      const user = await host.createUser();
      await readers.register(reader());

      expect(
        await readers.tap({ deviceId: 'device-1', authentication: host.authenticate(PLUGIN_A, 'device-1', user.id) }),
      ).toEqual({ ok: false, reason: 'NO_RESOURCE' });
      expect(
        await readers.tap({ deviceId: 'nope', authentication: host.authenticate(PLUGIN_A, 'nope', user.id) }),
      ).toEqual({ ok: false, reason: 'READER_NOT_FOUND' });
      expect(host.audited.map((event) => event.details.reasonCode)).toEqual(['NO_RESOURCE']);
    });

    it('refuses a door that is no longer access only', async () => {
      const { door, user } = await setUp();
      await host.database.setAccessOnly(door.id, false);

      const result = await readers.tap({
        deviceId: 'device-1',
        authentication: host.authenticate(PLUGIN_A, 'device-1', user.id),
      });

      expect(result).toEqual({ ok: false, reason: 'ACTION_NOT_ALLOWED' });
      expect(host.usage.openDoor).not.toHaveBeenCalled();
      expect(host.audited[0].details).toMatchObject({ result: 'refused', resourceId: door.id });
    });

    it('refuses during maintenance with the gate of every door action', async () => {
      const { user } = await setUp();
      host.maintenance.hasActiveMaintenance.mockResolvedValue(true);

      expect(
        await readers.tap({ deviceId: 'device-1', authentication: host.authenticate(PLUGIN_A, 'device-1', user.id) }),
      ).toEqual({ ok: false, reason: 'MAINTENANCE' });
      expect(await host.doorActions()).toEqual([]);
    });

    it('refuses an unhealthy resource as maintenance', async () => {
      const { user } = await setUp();
      host.health.isResourceUnhealthy.mockResolvedValue(true);

      expect(
        await readers.tap({ deviceId: 'device-1', authentication: host.authenticate(PLUGIN_A, 'device-1', user.id) }),
      ).toEqual({ ok: false, reason: 'MAINTENANCE' });
    });

    it('refuses a card owner without permission for the door', async () => {
      const { user } = await setUp();
      host.access.canControllResource.mockResolvedValue(false);

      expect(
        await readers.tap({ deviceId: 'device-1', authentication: host.authenticate(PLUGIN_A, 'device-1', user.id) }),
      ).toEqual({ ok: false, reason: 'ACCESS_DENIED' });
      expect(await host.doorActions()).toEqual([]);
    });

    it('refuses a disabled or deleted card owner', async () => {
      await setUp();
      const disabled = await host.createUser({ isDisabled: true });

      expect(
        await readers.tap({
          deviceId: 'device-1',
          authentication: host.authenticate(PLUGIN_A, 'device-1', disabled.id),
        }),
      ).toEqual({ ok: false, reason: 'ACCESS_DENIED' });
      expect(
        await readers.tap({ deviceId: 'device-1', authentication: host.authenticate(PLUGIN_A, 'device-1', 9999) }),
      ).toEqual({ ok: false, reason: 'ACCESS_DENIED' });
      expect(host.usage.openDoor).not.toHaveBeenCalled();
    });

    it.each([
      ['deactivated', (cardId: number) => host.database.deactivateCard(cardId)],
      ['deleted', (cardId: number) => host.database.deleteCard(cardId)],
    ])('refuses a card %s after it was authenticated', async (_label, change) => {
      const { user } = await setUp();
      const authentication = host.authenticate(PLUGIN_A, 'device-1', user.id);
      await change(host.cardOf(user.id));

      expect(await readers.tap({ deviceId: 'device-1', authentication })).toEqual({
        ok: false,
        reason: 'ACCESS_DENIED',
      });
      expect(host.usage.openDoor).not.toHaveBeenCalled();
    });

    it('refuses a second tap on the reader while one runs', async () => {
      const { user } = await setUp();
      let release!: () => void;
      let reached!: () => void;
      const checking = new Promise<void>((resolve) => (reached = resolve));
      host.access.canControllResource.mockImplementationOnce(() => {
        reached();
        return new Promise((resolve) => (release = () => resolve(true)));
      });

      const first = readers.tap({
        deviceId: 'device-1',
        authentication: host.authenticate(PLUGIN_A, 'device-1', user.id),
      });
      // The first tap is inside the door action's permission check.
      await checking;
      const second = await readers.tap({
        deviceId: 'device-1',
        authentication: host.authenticate(PLUGIN_A, 'device-1', user.id),
      });
      release();

      expect(second).toEqual({ ok: false, reason: 'BUSY' });
      await expect(first).resolves.toMatchObject({ ok: true });
      // Free again once the first finished.
      await expect(
        readers.tap({ deviceId: 'device-1', authentication: host.authenticate(PLUGIN_A, 'device-1', user.id) }),
      ).resolves.toMatchObject({ ok: true });
    });

    it.each([
      ['a flow error', new FlowExecutionError('node failed')],
      ['an external effect failure', new ExternalEffectFailureError('relay unreachable', null)],
    ])('reports %s of the recorded open as FLOW_FAILED and audits it as accepted', async (_label, error) => {
      const { door, user } = await setUp();
      // The door-unlocked flows run from this event, after the door action is stored.
      host.emitAsync.mockRejectedValueOnce(error);

      const result = await readers.tap({
        deviceId: 'device-1',
        authentication: host.authenticate(PLUGIN_A, 'device-1', user.id),
      });

      expect(result).toEqual({ ok: false, reason: 'FLOW_FAILED' });
      expect(await host.doorActions()).toEqual([
        expect.objectContaining({ resourceId: door.id, userId: user.id, usageAction: ResourceUsageAction.DoorUnlock }),
      ]);
      expect(host.audited.map((event) => event.details)).toEqual([
        expect.objectContaining({ result: 'accepted', resourceId: door.id, reasonCode: 'FLOW_FAILED' }),
      ]);
      expect(projectAuditRow(host.audited[0])).toMatchObject({ details: host.audited[0].details });
    });

    it('rejects an invalid request with a TypeError', async () => {
      await expect(readers.tap(undefined as any)).rejects.toThrow(TypeError);
      await expect(readers.tap({ deviceId: '', authentication: 'x' })).rejects.toThrow(TypeError);
      await expect(readers.tap({ deviceId: 'device-1', authentication: 5 as any })).rejects.toThrow(TypeError);
    });

    it('rejects a host failure with a generic error', async () => {
      const { user } = await setUp();
      host.usage.openDoor.mockRejectedValueOnce(new Error('SQLITE_BUSY: insert into resource_usage'));

      const result = readers.tap({
        deviceId: 'device-1',
        authentication: host.authenticate(PLUGIN_A, 'device-1', user.id),
      });

      await expect(result).rejects.toThrow('readers.tap failed in the host; try again later');
      await expect(result).rejects.not.toThrow(/SQLITE|resource_usage/);
    });
  });

  describe('authentications', () => {
    it('are 256-bit base64url handles, bounded with the oldest dropped first', () => {
      const first = host.authenticate(PLUGIN_A, 'd', 1);
      expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
      for (let index = 0; index < PLUGIN_CARD_AUTHENTICATION_LIMITS.maxPending; index++) {
        host.authenticate(PLUGIN_A, 'd', 1);
      }

      expect(host.authentications.size).toBe(PLUGIN_CARD_AUTHENTICATION_LIMITS.maxPending);
      expect(host.authentications.consume(first)).toBeNull();
    });

    it('forget long expired handles', () => {
      const issuedAt = Date.now();
      host.authentications.now = () => issuedAt;
      host.authenticate(PLUGIN_A, 'd', 1);
      host.authentications.now = () => issuedAt + PLUGIN_CARD_AUTHENTICATION_LIMITS.retainMs + 1;

      host.authenticate(PLUGIN_A, 'd', 1);

      expect(host.authentications.size).toBe(1);
    });

    it('of a plugin are dropped when its module is destroyed', () => {
      const a = host.authenticate(PLUGIN_A, 'd', 1);
      const b = host.authenticate(PLUGIN_B, 'd', 1);

      host.authentications.dropPlugin(PLUGIN_A);

      expect(host.authentications.consume(a)).toBeNull();
      expect(host.authentications.consume(b)).not.toBeNull();
    });
  });

  it('deletes all readers of a plugin on uninstall', async () => {
    const other = host.contextOf(PLUGIN_B, [PluginPermission.READER_DEVICES]).readers;
    await readers.register(reader('one'));
    await readers.register(reader('two'));
    await other.register(reader('one'));

    await host.service.deleteAllForPlugin(PLUGIN_A);

    expect(await readers.list()).toEqual([]);
    expect(await other.list()).toHaveLength(1);
  });
});
