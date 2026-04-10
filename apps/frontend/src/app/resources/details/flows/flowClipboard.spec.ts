import { describe, expect, it } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import {
  buildClipboardData,
  parseClipboardData,
  buildPastedElements,
  CLIPBOARD_TYPE,
  FlowClipboardData,
} from './flowClipboard';

const makeNode = (id: string, overrides: Partial<Node> = {}): Node => ({
  id,
  type: 'test-node',
  position: { x: 100, y: 200 },
  data: { label: `Node ${id}` },
  ...overrides,
});

const makeEdge = (id: string, source: string, target: string, overrides: Partial<Edge> = {}): Edge => ({
  id,
  source,
  target,
  ...overrides,
});

describe('buildClipboardData', () => {
  it('returns null when no nodes are selected', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    expect(buildClipboardData(nodes, [])).toBeNull();
  });

  it('returns only selected nodes', () => {
    const nodes = [
      makeNode('a', { selected: true }),
      makeNode('b'),
      makeNode('c', { selected: true }),
    ];
    const result = buildClipboardData(nodes, []);
    expect(result?.nodes).toHaveLength(2);
    expect(result?.nodes.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('includes edges where both source and target are selected', () => {
    const nodes = [
      makeNode('a', { selected: true }),
      makeNode('b', { selected: true }),
      makeNode('c'),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'c'),
      makeEdge('e3', 'c', 'b'),
    ];
    const result = buildClipboardData(nodes, edges);
    expect(result?.edges).toHaveLength(1);
    expect(result?.edges[0].id).toBe('e1');
  });

  it('strips measured, selected, and dragging from nodes', () => {
    const nodes = [
      makeNode('a', {
        selected: true,
        measured: { width: 200, height: 100 },
        dragging: true,
      }),
    ];
    const result = buildClipboardData(nodes, []);
    const node = result?.nodes[0];
    expect(node).not.toHaveProperty('measured');
    expect(node).not.toHaveProperty('selected');
    expect(node).not.toHaveProperty('dragging');
    expect(node?.id).toBe('a');
    expect(node?.data).toEqual({ label: 'Node a' });
  });

  it('strips selected from edges', () => {
    const nodes = [
      makeNode('a', { selected: true }),
      makeNode('b', { selected: true }),
    ];
    const edges = [makeEdge('e1', 'a', 'b', { selected: true })];
    const result = buildClipboardData(nodes, edges);
    expect(result?.edges[0]).not.toHaveProperty('selected');
  });

  it('preserves node data and position', () => {
    const nodes = [
      makeNode('a', {
        selected: true,
        position: { x: 42, y: 99 },
        data: { config: { threshold: 5 } },
      }),
    ];
    const result = buildClipboardData(nodes, []);
    expect(result?.nodes[0].position).toEqual({ x: 42, y: 99 });
    expect(result?.nodes[0].data).toEqual({ config: { threshold: 5 } });
  });
});

describe('parseClipboardData', () => {
  it('parses valid clipboard JSON', () => {
    const data: FlowClipboardData = {
      type: CLIPBOARD_TYPE,
      nodes: [makeNode('a')],
      edges: [],
    };
    const result = parseClipboardData(JSON.stringify(data));
    expect(result?.type).toBe(CLIPBOARD_TYPE);
    expect(result?.nodes).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parseClipboardData('not json')).toBeNull();
  });

  it('returns null for wrong type marker', () => {
    expect(parseClipboardData(JSON.stringify({ type: 'something-else', nodes: [], edges: [] }))).toBeNull();
  });

  it('returns null for missing nodes array', () => {
    expect(parseClipboardData(JSON.stringify({ type: CLIPBOARD_TYPE, edges: [] }))).toBeNull();
  });

  it('returns null for missing edges array', () => {
    expect(parseClipboardData(JSON.stringify({ type: CLIPBOARD_TYPE, nodes: [] }))).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseClipboardData('')).toBeNull();
  });
});

describe('buildPastedElements', () => {
  let idCounter: number;
  const generateId = () => `new-${++idCounter}`;

  const clipboardData: FlowClipboardData = {
    type: CLIPBOARD_TYPE,
    nodes: [makeNode('a', { position: { x: 100, y: 200 } }), makeNode('b', { position: { x: 300, y: 400 } })],
    edges: [makeEdge('e1', 'a', 'b')],
  };

  beforeEach(() => {
    idCounter = 0;
  });

  it('generates new IDs for all nodes', () => {
    const result = buildPastedElements(clipboardData, generateId);
    expect(result.nodes.map((n) => n.id)).toEqual(['new-1', 'new-2']);
  });

  it('offsets positions by the given offset', () => {
    const result = buildPastedElements(clipboardData, generateId, 75);
    expect(result.nodes[0].position).toEqual({ x: 175, y: 275 });
    expect(result.nodes[1].position).toEqual({ x: 375, y: 475 });
  });

  it('uses default offset of 50', () => {
    const result = buildPastedElements(clipboardData, generateId);
    expect(result.nodes[0].position).toEqual({ x: 150, y: 250 });
  });

  it('marks all pasted nodes as selected', () => {
    const result = buildPastedElements(clipboardData, generateId);
    expect(result.nodes.every((n) => n.selected)).toBe(true);
  });

  it('remaps edge source and target to new node IDs', () => {
    const result = buildPastedElements(clipboardData, generateId);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe('new-1');
    expect(result.edges[0].target).toBe('new-2');
  });

  it('generates new IDs for edges', () => {
    const result = buildPastedElements(clipboardData, generateId);
    expect(result.edges[0].id).toBe('new-3');
  });

  it('drops edges referencing nodes not in clipboard', () => {
    const data: FlowClipboardData = {
      type: CLIPBOARD_TYPE,
      nodes: [makeNode('a')],
      edges: [makeEdge('e1', 'a', 'missing')],
    };
    const result = buildPastedElements(data, generateId);
    expect(result.edges).toHaveLength(0);
  });

  it('strips measured and dragging from pasted nodes', () => {
    const data: FlowClipboardData = {
      type: CLIPBOARD_TYPE,
      nodes: [makeNode('a', { measured: { width: 200, height: 100 }, dragging: true })],
      edges: [],
    };
    const result = buildPastedElements(data, generateId);
    expect(result.nodes[0]).not.toHaveProperty('measured');
    expect(result.nodes[0]).not.toHaveProperty('dragging');
  });

  it('preserves node data through paste', () => {
    const data: FlowClipboardData = {
      type: CLIPBOARD_TYPE,
      nodes: [makeNode('a', { data: { config: { mqtt_topic: 'sensors/temp' } } })],
      edges: [],
    };
    const result = buildPastedElements(data, generateId);
    expect(result.nodes[0].data).toEqual({ config: { mqtt_topic: 'sensors/temp' } });
  });

  it('preserves node type through paste', () => {
    const data: FlowClipboardData = {
      type: CLIPBOARD_TYPE,
      nodes: [makeNode('a', { type: 'mqtt-publish' })],
      edges: [],
    };
    const result = buildPastedElements(data, generateId);
    expect(result.nodes[0].type).toBe('mqtt-publish');
  });
});
