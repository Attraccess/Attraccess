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
        { id: 'door-lock', profile: 'pulsed-lock-bank', capabilities: ['output', 'pulse'] },
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
      getRepository: () => ({ findOneBy: async () => ({ presetProvenance: JSON.stringify({ editor: { names: { 'door-lock': 'Workshop door lock' } } }) }) }),
    } as unknown as PluginContext,
    controllers: () => ({ find: async () => [{ id: 1, name: 'Workshop' }] }) as unknown as Repository<WagoController>,
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
        value: { type: 'boolean', default: false },
        expectedConfigurationRevision: { default: 3, readOnly: true },
        action: { oneOf: [{ const: 'set' }, { const: 'pulse' }] },
      },
      required: expect.arrayContaining(['value', 'expectedConfigurationRevision']),
    });
  });

  it('does not expose operations for an input-only channel', async () => {
    const schema = await handler.schema({ controllerId: 1, channelId: 'door-contact' }, 2);
    expect(schema.properties).not.toHaveProperty('action');
    expect(schema.required).toEqual(expect.arrayContaining(['channelId', 'action', 'expectedConfigurationRevision']));
  });

  it('does not offer pulses for non-pulsed outputs', async () => {
    const schema = await handler.schema({ controllerId: 1, channelId: 'lamp' }, 2);
    expect(schema.properties).toMatchObject({ action: { oneOf: [{ const: 'set', title: 'Set state' }] } });
  });

  it('keeps an unapplied controller incomplete with actionable help', async () => {
    appliedRevision.mockResolvedValue(null);
    const schema = await handler.schema({ controllerId: 1 }, 2);
    expect(schema.properties).toMatchObject({ controllerId: { description: expect.stringContaining('wait for the controller') } });
    expect(schema.required).toEqual(expect.arrayContaining(['channelId', 'action', 'expectedConfigurationRevision']));
  });
});
