import { projectResourceAuditEvent } from '../../audit/policies/resources';
import { AuditCanvas, AuditFlowNode, canvasDetails, canvasSaveDetails, diffCanvas, redactFlowData } from './flow-audit';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const node = (id: string, data: Record<string, unknown> = {}, type = 'output.http', x = 0): AuditFlowNode => ({
  id,
  type,
  data,
  position: { x, y: 0 },
});
const edge = (id: string, source = 'a', target = 'b') => ({
  id,
  source,
  target,
  sourceHandle: 'out',
  targetHandle: 'in',
});
const requireDiff = (before: AuditCanvas, after: AuditCanvas) => {
  const diff = diffCanvas(before, after);
  if (!diff) throw new Error('expected a change');
  return diff;
};
const bytes = (details: object) => Buffer.byteLength(JSON.stringify(details), 'utf8');
const bigFlow = (nodeCount: number, dataBytes: number): AuditCanvas => ({
  nodes: Array.from({ length: nodeCount }, (_, i) => node(`node-${i}`, { body: 'x'.repeat(dataBytes), i })),
  edges: Array.from({ length: nodeCount - 1 }, (_, i) => edge(`edge-${i}`, `node-${i}`, `node-${i + 1}`)),
});
const projected = (action: 'resource_flow.updated' | 'flow.canvas_updated' | 'flow.deleted', details: object) =>
  projectResourceAuditEvent({
    action,
    operationId: OPERATION_ID,
    actorId: 1,
    authenticationMethod: 'session',
    subjectId: 5,
    subjectType: action === 'resource_flow.updated' ? 'resource' : 'flow',
    details: details as Record<string, string | number>,
  });

describe('redactFlowData', () => {
  it('redacts every header value and secret-like keys at any depth, and keeps the rest', () => {
    expect(
      redactFlowData({
        url: 'https://example.com',
        headers: { Authorization: 'Bearer abc', 'X-Plain': 'v', nested: { deep: 'v' } },
        password: 'p',
        apiKey: 'k',
        'api-key': 'k',
        client_secret: 's',
        Credentials: 'c',
        options: [{ accessToken: 't', retries: 3 }],
      }),
    ).toEqual({
      url: 'https://example.com',
      headers: { Authorization: '[redacted]', 'X-Plain': '[redacted]', nested: '[redacted]' },
      password: '[redacted]',
      apiKey: '[redacted]',
      'api-key': '[redacted]',
      client_secret: '[redacted]',
      Credentials: '[redacted]',
      options: [{ accessToken: '[redacted]', retries: 3 }],
    });
  });
});

describe('diffCanvas', () => {
  const before: AuditCanvas = { nodes: [node('a'), node('b', { url: 'x' })], edges: [edge('e1')] };

  it('is null for an identical canvas, also when only positions moved or key order differs', () => {
    expect(
      diffCanvas(before, {
        nodes: [node('a', {}, 'output.http', 400), node('b', { url: 'x' }, 'output.http', 90)],
        edges: [edge('e1')],
      }),
    ).toBeNull();
    expect(
      diffCanvas(
        { nodes: [node('a', { p: 1, q: { r: 1, s: 2 } })], edges: [] },
        { nodes: [node('a', { q: { s: 2, r: 1 }, p: 1 })], edges: [] },
      ),
    ).toBeNull();
  });

  it('lists added, removed and changed nodes and edges', () => {
    const diff = diffCanvas(before, {
      nodes: [node('b', { url: 'y' }), node('c', {}, 'input.start')],
      edges: [edge('e2')],
    });
    expect(diff).toEqual({
      addedNodes: [{ id: 'c', type: 'input.start' }],
      removedNodes: [{ id: 'a', type: 'output.http' }],
      changedNodes: [{ id: 'b', type: 'output.http' }],
      addedEdges: ['e2'],
      removedEdges: ['e1'],
    });
  });

  it('treats a changed type or re-wired edge as a change', () => {
    const diff = diffCanvas(before, {
      nodes: [node('a', {}, 'other.type'), node('b', { url: 'x' })],
      edges: [edge('e1', 'a', 'c')],
    });
    expect(diff?.changedNodes).toEqual([{ id: 'a', type: 'other.type' }]);
    expect(diff?.addedEdges).toEqual(['e1']);
    expect(diff?.removedEdges).toEqual(['e1']);
  });

  it('reports every node of an emptied canvas as removed', () => {
    expect(diffCanvas(before, { nodes: [], edges: [] })).toMatchObject({
      removedNodes: [
        { id: 'a', type: 'output.http' },
        { id: 'b', type: 'output.http' },
      ],
      removedEdges: ['e1'],
    });
  });

  it('treats null data as empty data', () => {
    expect(
      diffCanvas({ nodes: [{ ...node('a'), data: null }], edges: [] }, { nodes: [node('a')], edges: [] }),
    ).toBeNull();
  });
});

describe('canvasSaveDetails', () => {
  const small: AuditCanvas = { nodes: [node('a', { url: 'u' }), node('b')], edges: [edge('e1')] };
  const emptied: AuditCanvas = { nodes: [], edges: [] };
  const detailsFor = (before: AuditCanvas, after: AuditCanvas, flowName?: string) =>
    canvasSaveDetails(before, after, requireDiff(before, after), flowName);

  it('records counts, lists and the full snapshot (with positions) when it fits', () => {
    const details = detailsFor(small, emptied, 'Notify');
    expect(details).toMatchObject({
      flowName: 'Notify',
      'before.nodeCount': 2,
      'after.nodeCount': 0,
      'before.edgeCount': 1,
      'after.edgeCount': 0,
      removedNodes: JSON.stringify([
        { id: 'a', type: 'output.http' },
        { id: 'b', type: 'output.http' },
      ]),
      removedEdges: '["e1"]',
      snapshotDetail: 'full',
    });
    expect(JSON.parse(details['before.snapshot'] as string)).toEqual({
      nodes: [
        { id: 'a', type: 'output.http', data: { url: 'u' }, position: { x: 0, y: 0 } },
        { id: 'b', type: 'output.http', data: {}, position: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' }],
    });
    expect(projected('flow.canvas_updated', details)).not.toBeNull();
  });

  it('omits flowName for a resource flow', () => {
    expect(detailsFor(small, emptied)).not.toHaveProperty('flowName');
  });

  it('stores the redacted form only', () => {
    const before: AuditCanvas = {
      nodes: [node('a', { url: 'u', headers: { Authorization: 'Bearer SECRET-VALUE' }, password: 'hunter2' })],
      edges: [],
    };
    const details = detailsFor(before, emptied);
    expect(JSON.stringify(details)).not.toMatch(/SECRET-VALUE|hunter2/);
    expect(details['before.snapshot']).toContain('[redacted]');
  });

  it('flags a changed secret as changed without storing either value', () => {
    const before: AuditCanvas = { nodes: [node('a', { token: 'old-secret' })], edges: [] };
    const after: AuditCanvas = { nodes: [node('a', { token: 'new-secret' })], edges: [] };
    const details = detailsFor(before, after);
    expect(details.changedNodes).toBe('[{"id":"a","type":"output.http"}]');
    expect(JSON.stringify(details)).not.toMatch(/old-secret|new-secret/);
  });

  describe('degrades the snapshot until the details fit', () => {
    it('drops positions first', () => {
      // 40 nodes: only the positions push it over the limit.
      const before: AuditCanvas = {
        nodes: Array.from({ length: 20 }, (_, i) => node(`n-${i}`, {}, 'output.http', 123456.789)),
        edges: [],
      };
      const full = canvasDetails({}, before);
      expect(full.snapshotDetail).toBe('full');
      const larger: AuditCanvas = {
        nodes: Array.from({ length: 40 }, (_, i) => ({
          ...node(`node-${i}`),
          position: { x: 123456.789, y: 98765.4321 },
        })),
        edges: [],
      };
      const details = canvasDetails({}, larger);
      expect(details.snapshotDetail).toBe('no_positions');
      expect(details['before.snapshot']).not.toContain('position');
      expect(bytes(details)).toBeLessThanOrEqual(4096);
    });

    it('drops node data next, keeping ids, types and all edges', () => {
      const details = detailsFor(bigFlow(10, 400), emptied);
      expect(details.snapshotDetail).toBe('no_data');
      const snapshot = JSON.parse(details['before.snapshot'] as string);
      expect(snapshot.nodes).toHaveLength(10);
      expect(snapshot.nodes[0]).toEqual({ id: 'node-0', type: 'output.http' });
      expect(snapshot.edges).toHaveLength(9);
      expect(JSON.parse(details.removedNodes as string)).toHaveLength(10);
      expect(bytes(details)).toBeLessThanOrEqual(4096);
      expect(projected('resource_flow.updated', details)).not.toBeNull();
    });

    it('omits the snapshot last and truncates the diff lists, keeping their counts', () => {
      const before = bigFlow(200, 4000);
      const details = detailsFor(before, emptied, 'Big flow');
      expect(details.snapshotDetail).toBe('omitted');
      expect(details).not.toHaveProperty('before.snapshot');
      expect(details).toMatchObject({
        'before.nodeCount': 200,
        'after.nodeCount': 0,
        'before.edgeCount': 199,
        removedNodeCount: 200,
        removedEdgeCount: 199,
        addedNodeCount: 0,
      });
      expect(JSON.parse(details.removedNodes as string).length).toBeLessThan(200);
      expect(bytes(details)).toBeLessThanOrEqual(4096);
      expect(projected('flow.canvas_updated', details)).not.toBeNull();
      expect(projected('resource_flow.updated', detailsFor(before, emptied))).not.toBeNull();
    });

    it('still records a replacement of a large canvas, with a bounded diff', () => {
      const before = bigFlow(200, 4000);
      const after = bigFlow(200, 4001);
      const details = detailsFor(before, after);
      expect(details.changedNodeCount).toBe(200);
      expect(bytes(details)).toBeLessThanOrEqual(4096);
      expect(projected('resource_flow.updated', details)).not.toBeNull();
    });

    it('handles escaping-heavy data, because the size is measured on the serialized details', () => {
      const before: AuditCanvas = { nodes: [node('a', { script: '"\\\n'.repeat(900) })], edges: [] };
      const details = detailsFor(before, emptied);
      expect(details.snapshotDetail).not.toBe('full');
      expect(bytes(details)).toBeLessThanOrEqual(4096);
    });
  });
});

describe('canvasDetails for a deleted flow', () => {
  it('carries the snapshot and counts next to the base fields', () => {
    const details = canvasDetails({ 'before.name': 'Notify', 'before.enabled': 1 }, bigFlow(3, 10));
    expect(details).toMatchObject({
      'before.name': 'Notify',
      'before.enabled': 1,
      'before.nodeCount': 3,
      'before.edgeCount': 2,
      snapshotDetail: 'full',
    });
    expect(projected('flow.deleted', details)).not.toBeNull();
  });

  it('degrades for a large flow like a canvas save', () => {
    const details = canvasDetails({ 'before.name': 'Notify', 'before.enabled': 1 }, bigFlow(200, 4000));
    expect(details.snapshotDetail).toBe('omitted');
    expect(bytes(details)).toBeLessThanOrEqual(4096);
    expect(projected('flow.deleted', details)).not.toBeNull();
  });
});
