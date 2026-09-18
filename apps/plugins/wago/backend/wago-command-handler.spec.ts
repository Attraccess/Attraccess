import type { PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoCommandHandler } from './wago-command-handler';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';

describe('WAGO command form', () => {
  const revision = Object.assign(new WagoConfigurationRevision(), {
    revision: 3,
    snapshot: JSON.stringify({
      logicalChannels: [
        { id: 'door-contact', profile: 'generic-monitored-input', capabilities: ['input'] },
        { id: 'door-lock', profile: 'pulsed-lock-bank', capabilities: ['output', 'pulse'], pulse: { durationMs: 500 } },
        { id: 'lamp', profile: 'generic-digital-output', capabilities: ['output'] },
      ],
    }),
  });
  const appliedRevision = jest.fn();
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([{ resourceId: 7, id: 'other-node' }]),
  };
  const handler = new WagoCommandHandler({
    context: {
      dataSource: { getRepository: () => ({ createQueryBuilder: () => query }) },
      getRepository: () => ({
        findOneBy: async () => ({
          presetProvenance: JSON.stringify({ editor: { names: { 'door-lock': 'Workshop door lock' } } }),
        }),
      }),
    } as unknown as PluginContext,
    controllers: () =>
      ({
        find: async () => [{ id: 1, name: 'Workshop' }],
        findOneBy: async () => ({ id: 1, trustState: 'claimed' }),
      }) as unknown as Repository<WagoController>,
    claimedController: jest.fn(),
    getSettings: jest.fn(),
    appliedRevision,
  });

  beforeEach(() => appliedRevision.mockResolvedValue(revision));

  it('lists only output channels and shows cross-resource conflict help', async () => {
    const schema = await handler.schema({ controllerId: 1, channelId: 'door-lock', action: 'set' }, 2);
    expect(schema).toMatchObject({
      properties: {
        channelId: {
          oneOf: [{ const: 'door-lock', title: 'Workshop door lock' }, { const: 'lamp' }],
          description: expect.stringContaining('resource 7 / node other-node'),
        },
        expectedConfigurationRevision: { default: 3, readOnly: true },
        action: { oneOf: [{ const: 'pulse', title: 'Trigger pulse' }], description: expect.stringContaining('500 ms') },
      },
      required: expect.arrayContaining(['expectedConfigurationRevision']),
    });
    expect(schema.properties).not.toHaveProperty('value');
    expect((schema.properties as Record<string, unknown>).action).not.toHaveProperty('default');
  });

  it('does not expose operations for an input-only channel', async () => {
    const schema = await handler.schema({ controllerId: 1, channelId: 'door-contact' }, 2);
    expect(schema.properties).not.toHaveProperty('action');
    expect(schema.required).toEqual(expect.arrayContaining(['channelId', 'action', 'expectedConfigurationRevision']));
  });

  it('does not offer pulses for non-pulsed outputs', async () => {
    const schema = await handler.schema({ controllerId: 1, channelId: 'lamp' }, 2);
    expect(schema.properties).toMatchObject({
      action: { oneOf: [{ const: 'set', title: 'Turn on / turn off' }], default: 'set' },
      value: { type: 'boolean', default: false },
    });
  });

  it('defaults new pulsed nodes to the configured behavior', async () => {
    const schema = await handler.schema({ controllerId: 1, channelId: 'door-lock' }, 2);
    expect(schema.properties).toMatchObject({ action: { default: 'pulse' } });
  });

  it.each([true, false])('rejects a legacy set %s on a pulsed channel with correction instructions', async (value) => {
    const config = { controllerId: 1, channelId: 'door-lock', action: 'set', value, expectedConfigurationRevision: 3 };
    expect(await handler.validate(config)).toEqual([
      { field: 'action', message: expect.stringContaining('explicitly select Trigger pulse') },
    ]);
    await expect(handler.execute(config)).rejects.toThrow('explicitly select Trigger pulse');
  });

  it('rejects pulses on switched outputs and accepts the configured operations', async () => {
    const config = { controllerId: 1, expectedConfigurationRevision: 3 };
    expect(await handler.validate({ ...config, channelId: 'lamp', action: 'pulse' })).toEqual([
      { field: 'action', message: expect.stringContaining('switched') },
    ]);
    expect(await handler.validate({ ...config, channelId: 'lamp', action: 'set', value: true })).toEqual([]);
    expect(await handler.validate({ ...config, channelId: 'door-lock', action: 'pulse' })).toEqual([]);
  });

  it('keeps an unapplied controller incomplete with actionable help', async () => {
    appliedRevision.mockResolvedValue(null);
    const schema = await handler.schema({ controllerId: 1 }, 2);
    expect(schema.properties).toMatchObject({
      controllerId: { description: expect.stringContaining('wait for the controller') },
    });
    expect(schema.required).toEqual(expect.arrayContaining(['channelId', 'action', 'expectedConfigurationRevision']));
  });
});
