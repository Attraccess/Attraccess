import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { configurationFlowImpacts } from './configuration-flow-references';
import type { WagoConfigurationSnapshot } from './configuration';

describe('configuration flow impacts', () => {
  const previous: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: [
      { id: 'in', hardwareProfile: '751-9301', channel: 4 },
      { id: 'out', hardwareProfile: '751-9301', channel: 0 },
    ],
    logicalChannels: [
      {
        id: 'contact',
        physicalPointId: 'in',
        profile: 'generic-monitored-input',
        capabilities: ['input'],
        disconnectPolicy: { mode: 'hold' },
      },
      {
        id: 'lock',
        physicalPointId: 'out',
        profile: 'guarded-enable-request',
        capabilities: ['output', 'guard'],
        disconnectPolicy: { mode: 'immediate' },
        guard: { channelId: 'contact', when: 'on' },
      },
    ],
  };
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([
      {
        id: 'guarded-command',
        resourceId: 4,
        type: 'plugin.wago.command',
        data: { controllerId: 1, channelId: 'lock' },
      },
      { id: 'unrelated', resourceId: 5, type: 'plugin.wago.input', data: { controllerId: 1, channelId: 'other' } },
    ]),
  };
  const context = {
    dataSource: { getRepository: () => ({ createQueryBuilder: () => query }) },
  } as unknown as PluginContext;

  it('includes actual flow references affected indirectly through a reassigned guard', async () => {
    const current = {
      ...previous,
      physicalPoints: previous.physicalPoints.map((point) => (point.id === 'in' ? { ...point, channel: 5 } : point)),
    };
    const impacts = await configurationFlowImpacts(context, 1, previous, current);
    expect(impacts).toEqual([
      expect.objectContaining({ channelId: 'contact', references: [] }),
      expect.objectContaining({
        channelId: 'lock',
        references: [{ resourceId: 4, nodeId: 'guarded-command', nodeType: 'plugin.wago.command' }],
      }),
    ]);
    expect(query.andWhere).toHaveBeenCalledWith("node.data ->> 'controllerId' = :controllerId", { controllerId: 1 });
  });

  it('warns about revision-pinned commands even when the snapshot is unchanged', async () => {
    query.getMany.mockClear();
    await expect(configurationFlowImpacts(context, 1, previous, previous)).resolves.toEqual([
      expect.objectContaining({
        channelId: 'lock',
        message: expect.stringContaining('Reopen and save'),
        references: [{ resourceId: 4, nodeId: 'guarded-command', nodeType: 'plugin.wago.command' }],
      }),
    ]);
    expect(query.getMany).toHaveBeenCalledTimes(1);
  });
});
