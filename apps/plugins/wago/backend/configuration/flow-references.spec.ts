import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { flowNode, hostDataWithFlows } from '../persistence.test-utils';
import { configurationFlowImpacts } from './flow-references';
import type { WagoConfigurationSnapshot } from './model';

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
  const findNodes = jest.fn().mockResolvedValue([
    flowNode({
      id: 'guarded-command',
      resourceId: 4,
      type: 'plugin.wago.command',
      data: { controllerId: 1, channelId: 'lock' },
    }),
    flowNode({
      id: 'unrelated',
      resourceId: 5,
      type: 'plugin.wago.input',
      data: { controllerId: 1, channelId: 'other' },
    }),
  ]);
  const context = { hostData: hostDataWithFlows(findNodes) } as unknown as PluginContext;

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
        references: [
          { resourceId: 4, flowId: null, flowName: null, nodeId: 'guarded-command', nodeType: 'plugin.wago.command' },
        ],
      }),
    ]);
    expect(findNodes).toHaveBeenCalledWith({ typePrefix: 'plugin.wago.', dataEquals: { controllerId: 1 } });
  });

  it('warns about revision-pinned commands even when the snapshot is unchanged', async () => {
    findNodes.mockClear();
    await expect(configurationFlowImpacts(context, 1, previous, previous)).resolves.toEqual([
      expect.objectContaining({
        channelId: 'lock',
        message: expect.stringContaining('Reopen and save'),
        references: [
          { resourceId: 4, flowId: null, flowName: null, nodeId: 'guarded-command', nodeType: 'plugin.wago.command' },
        ],
      }),
    ]);
    expect(findNodes).toHaveBeenCalledTimes(1);
  });

  it('reports global-flow nodes with their flow and no resource', async () => {
    findNodes.mockResolvedValueOnce([
      flowNode({
        id: 'global-command',
        resourceId: null,
        flowId: 9,
        flowName: 'Power off all',
        type: 'plugin.wago.command',
        data: { controllerId: 1, channelId: 'lock' },
      }),
    ]);
    const impacts = await configurationFlowImpacts(context, 1, previous, previous);
    expect(impacts[0].references).toEqual([
      {
        resourceId: null,
        flowId: 9,
        flowName: 'Power off all',
        nodeId: 'global-command',
        nodeType: 'plugin.wago.command',
      },
    ]);
  });
});
