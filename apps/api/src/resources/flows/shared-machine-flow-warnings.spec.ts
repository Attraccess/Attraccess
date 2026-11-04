import { ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { findFlowsWithoutSessionCountCheck } from './shared-machine-flow-warnings';

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
    const data = { path: 'x', comparisonValueIsPath: true, comparisonValue: 'activeSessions.before' };
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
});
