import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { getLayoutedElements } from './flowLayout';

const node = (id: string): Node => ({ id, data: {}, position: { x: 0, y: 0 }, measured: { width: 256, height: 100 } });
const edge = (source: string, target: string, sourceHandle: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle,
  targetHandle: 'input',
});

describe('flow auto layout', () => {
  it.each([false, true])('places branch targets in visual output order (reverse insertion: %s)', (reverse) => {
    const nodes = ['if', 'idle', 'operating'].map(node);
    const edges = [edge('if', 'idle', 'false'), edge('if', 'operating', 'true')];
    if (reverse) {
      nodes.reverse();
      edges.reverse();
    }
    const result = getLayoutedElements(nodes, edges, new Map([['if', ['true', 'false']]]));
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId.operating.position.x).toBeLessThan(byId.idle.position.x);
    expect(result.edges).toBe(edges);
  });

  it('keeps nested branches and their downstream chains ordered before they merge', () => {
    const nodes = ['root', 'if', 'right', 'left', 'right-next', 'left-next', 'merge', 'unconnected'].map(node);
    const edges = [
      edge('root', 'if', 'out'),
      edge('if', 'right', 'no'),
      edge('if', 'left', 'yes'),
      edge('right', 'right-next', 'out'),
      edge('left', 'left-next', 'out'),
      edge('right-next', 'merge', 'out'),
      edge('left-next', 'merge', 'out'),
    ];
    const handles = new Map([['if', ['yes', 'no']]]);
    const result = getLayoutedElements(nodes, edges, handles);
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    const position = (id: string) => byId[id].position;
    expect(position('left').x).toBeLessThan(position('right').x);
    expect(position('left-next').x).toBeLessThan(position('right-next').x);
    expect(position('merge').y).toBeGreaterThan(position('left-next').y);
    expect(getLayoutedElements(result.nodes, edges, handles)).toEqual(result);
    expect(nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true);
  });

  it('uses arbitrary plugin port order, including more than two outputs and unequal node sizes', () => {
    const nodes = ['plugin', 'a', 'z', 'm'].map(node);
    nodes[1].measured = { width: 400, height: 180 };
    const edges = [edge('plugin', 'a', 'alpha'), edge('plugin', 'm', 'middle'), edge('plugin', 'z', 'zeta')];
    const result = getLayoutedElements(nodes, edges, new Map([['plugin', ['zeta', 'middle', 'alpha']]]));
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId.z.position.x + 256).toBeLessThan(byId.m.position.x);
    expect(byId.m.position.x + 256).toBeLessThan(byId.a.position.x);
  });

  it('handles shared targets, conflicting branch orders, cycles and unknown handles without losing graph data', () => {
    const nodes = ['one', 'two', 'left', 'right'].map(node);
    const edges = [
      edge('one', 'left', 'yes'),
      edge('one', 'right', 'no'),
      edge('two', 'right', 'yes'),
      edge('two', 'left', 'no'),
      edge('one', 'left', 'no'),
      edge('left', 'one', 'unknown'),
    ];
    const result = getLayoutedElements(
      nodes,
      edges,
      new Map([
        ['one', ['yes', 'no']],
        ['two', ['yes', 'no']],
      ]),
    );
    expect(result.edges).toBe(edges);
    expect(result.nodes.map((n) => n.id)).toEqual(nodes.map((n) => n.id));
    expect(result.nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
  });

  it('supports empty graphs and nodes whose handles and dimensions are not measured yet', () => {
    expect(getLayoutedElements([], [])).toEqual({ nodes: [], edges: [] });
    const nodes = ['one', 'two'].map((id) => ({ id, data: {}, position: { x: 0, y: 0 } }));
    const result = getLayoutedElements(nodes, [edge('one', 'two', 'unknown')]);
    expect(result.nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
  });
});
