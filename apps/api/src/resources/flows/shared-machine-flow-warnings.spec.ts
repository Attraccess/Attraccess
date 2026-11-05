import { ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import type { PluginFlowNodeDefinition } from '@attraccess/plugins-backend-sdk';
import { registerPluginFlowNodes } from '../../plugin-system/flows/node-registry';
import { findFlowsWithoutSessionCountCheck } from './shared-machine-flow-warnings';

const pluginNode = (type: string, extra: Partial<PluginFlowNodeDefinition>) =>
  ({
    type,
    label: type,
    description: type,
    configSchema: {},
    inputs: ['input'],
    outputs: ['output'],
    execute: async () => ({ payload: {} }),
    ...extra,
  }) as PluginFlowNodeDefinition;

registerPluginFlowNodes('warnings-spec', [
  pluginNode('plugin.warnings-spec.switch', { isOutput: true }),
  pluginNode('plugin.warnings-spec.command', { getFailureBehavior: () => undefined }),
  pluginNode('plugin.warnings-spec.read', {}),
  pluginNode('plugin.warnings-spec.trigger', {
    isInput: true,
    inputs: [],
    outputs: ['output'],
    execute: undefined,
  } as Partial<PluginFlowNodeDefinition>),
]);

const node = (id: string, type: string, data: object = {}) => ({ id, type, data }) as unknown as ResourceFlowNode;
const edges = (...pairs: [string, string][]) =>
  pairs.map(([source, target]) => ({ id: `${source}-${target}`, source, target })) as unknown as ResourceFlowEdge[];

const STOPPED = ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED;
const HTTP = ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST;
const IF = ResourceFlowNodeType.PROCESSING_IF;
const afterIsZero = { path: 'activeSessions.after', comparisonOperator: '=', comparisonValue: '0' };

describe('findFlowsWithoutSessionCountCheck', () => {
  it('flags a trigger that reaches an external effect directly', () => {
    expect(findFlowsWithoutSessionCountCheck([node('t', STOPPED), node('h', HTTP)], edges(['t', 'h']))).toEqual([
      { triggerNodeId: 't', triggerType: STOPPED, effectNodes: [{ nodeId: 'h', nodeType: HTTP }] },
    ]);
  });

  it('accepts effects behind an IF node checking activeSessions', () => {
    const nodes = [node('t', STOPPED), node('i', IF, afterIsZero), node('h', HTTP)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'i'], ['i', 'h']))).toEqual([]);
  });

  it('accepts a check that names activeSessions as the compared path', () => {
    const data = {
      path: 'x',
      comparisonOperator: '=',
      comparisonValueIsPath: true,
      comparisonValue: 'activeSessions.before',
    };
    const nodes = [node('t', STOPPED), node('i', IF, data), node('h', HTTP)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'i'], ['i', 'h']))).toEqual([]);
  });

  it('flags effects behind an IF node that checks something else', () => {
    const nodes = [node('t', STOPPED), node('i', IF, { ...afterIsZero, path: 'user.id' }), node('h', HTTP)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'i'], ['i', 'h']))).toHaveLength(1);
  });

  it('flags an effect that is also reachable around the check', () => {
    const nodes = [node('t', STOPPED), node('i', IF, afterIsZero), node('h', HTTP)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'i'], ['i', 'h'], ['t', 'h']))).toHaveLength(1);
  });

  it('ignores flows without external effects and other triggers', () => {
    const nodes = [
      node('t', STOPPED),
      node('b', ResourceFlowNodeType.INPUT_BUTTON),
      node('h', HTTP),
      node('e', ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION),
    ];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'e'], ['b', 'h']))).toEqual([]);
  });

  it('terminates on cycles', () => {
    const nodes = [node('t', STOPPED), node('w', ResourceFlowNodeType.PROCESSING_WAIT), node('h', HTTP)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'w'], ['w', 'h'], ['h', 'w']))).toHaveLength(1);
  });

  it.each([
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
  ])('flags the %s trigger', (trigger) => {
    expect(findFlowsWithoutSessionCountCheck([node('t', trigger), node('h', HTTP)], edges(['t', 'h']))).toEqual([
      { triggerNodeId: 't', triggerType: trigger, effectNodes: [{ nodeId: 'h', nodeType: HTTP }] },
    ]);
  });

  it.each([
    [HTTP, true],
    [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, true],
    [ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC, true],
    [ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC, true],
    ['plugin.warnings-spec.switch', true],
    ['plugin.warnings-spec.command', true],
    [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION, false],
    [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD, false],
    ['plugin.warnings-spec.read', false],
    ['plugin.warnings-spec.trigger', false],
    ['plugin.unknown.node', false],
  ])('treats %s as an external effect: %s', (type, flagged) => {
    const warnings = findFlowsWithoutSessionCountCheck([node('t', STOPPED), node('x', type)], edges(['t', 'x']));
    expect(warnings).toHaveLength(flagged ? 1 : 0);
  });

  it('warns for a plugin output node after a session trigger and accepts it behind a count check', () => {
    const plugin = 'plugin.warnings-spec.switch';
    expect(findFlowsWithoutSessionCountCheck([node('t', STOPPED), node('p', plugin)], edges(['t', 'p']))).toEqual([
      { triggerNodeId: 't', triggerType: STOPPED, effectNodes: [{ nodeId: 'p', nodeType: plugin }] },
    ]);
    const guarded = [node('t', STOPPED), node('i', IF, afterIsZero), node('p', plugin)];
    expect(findFlowsWithoutSessionCountCheck(guarded, edges(['t', 'i'], ['i', 'p']))).toEqual([]);
  });

  it('flags an effect placed before the check', () => {
    const nodes = [node('t', STOPPED), node('h', HTTP), node('i', IF, afterIsZero)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'h'], ['h', 'i']))).toHaveLength(1);
  });

  it.each([
    ['activeSessions.before', false],
    [' activeSessions.after ', false],
    ['activeSessions.limit', true],
    ['activeSessions', true],
    ['activeSessionsX.after', true],
  ])('IF on %s still warns: %s', (path, flagged) => {
    const nodes = [node('t', STOPPED), node('i', IF, { ...afterIsZero, path }), node('h', HTTP)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'i'], ['i', 'h']))).toHaveLength(flagged ? 1 : 0);
  });

  it('does not count a literal comparison value that only looks like the count path', () => {
    const data = { path: 'x', comparisonOperator: '=', comparisonValue: 'activeSessions.after' };
    const nodes = [node('t', STOPPED), node('i', IF, data), node('h', HTTP)];
    expect(findFlowsWithoutSessionCountCheck(nodes, edges(['t', 'i'], ['i', 'h']))).toHaveLength(1);
  });
});
