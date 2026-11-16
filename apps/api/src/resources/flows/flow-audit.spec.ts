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

  describe('degrades the snapshot before it shortens a diff list', () => {
    /** Every node's data changes, so every node is in `changedNodes`. */
    const editAll = (before: AuditCanvas): AuditCanvas => ({
      nodes: before.nodes.map((n) => ({ ...n, data: { ...n.data, v: 2 } })),
      edges: before.edges,
    });

    it('drops positions and keeps every listed node when the full snapshot fits only without the lists', () => {
      const before: AuditCanvas = {
        nodes: Array.from({ length: 14 }, (_, i) => ({
          ...node(`node-${i}`, { body: 'x'.repeat(120), v: 1 }),
          position: { x: 123456.789, y: 98765.4321 },
        })),
        edges: [],
      };
      const details = detailsFor(before, editAll(before));
      // The full snapshot alone would fit, so shortening the lists first would have kept the positions.
      const fullSnapshot = JSON.stringify({ nodes: before.nodes, edges: [] });
      expect(bytes({ ...details, 'before.snapshot': fullSnapshot, changedNodes: '[]' })).toBeLessThanOrEqual(4096);

      expect(details.snapshotDetail).toBe('no_positions');
      expect(JSON.parse(details.changedNodes as string)).toHaveLength(14);
      expect(details.changedNodeCount).toBe(14);
      expect(JSON.parse(details['before.snapshot'] as string).nodes[13]).toEqual({
        id: 'node-13',
        type: 'output.http',
        data: { body: 'x'.repeat(120), v: 1 },
      });
      expect(bytes(details)).toBeLessThanOrEqual(4096);
      expect(projected('resource_flow.updated', details)).not.toBeNull();
    });

    it('omits the snapshot and keeps every listed node when the lists fit alone', () => {
      const before: AuditCanvas = {
        nodes: Array.from({ length: 50 }, (_, i) => node(`node-${i}`, { v: 1 })),
        edges: [],
      };
      const details = detailsFor(before, editAll(before));
      expect(details.snapshotDetail).toBe('omitted');
      expect(details).not.toHaveProperty('before.snapshot');
      expect(JSON.parse(details.changedNodes as string)).toHaveLength(50);
      expect(details).toMatchObject({ changedNodeCount: 50, 'before.nodeCount': 50, 'after.nodeCount': 50 });
      expect(bytes(details)).toBeLessThanOrEqual(4096);
      expect(projected('resource_flow.updated', details)).not.toBeNull();
    });

    it('shortens the lists only once the snapshot is gone, keeping a prefix and the full counts', () => {
      const before: AuditCanvas = {
        nodes: Array.from({ length: 150 }, (_, i) => node(`node-${i}`, { v: 1 })),
        edges: [],
      };
      const details = detailsFor(before, editAll(before));
      expect(details.snapshotDetail).toBe('omitted');
      const listed = JSON.parse(details.changedNodes as string);
      expect(listed.length).toBeGreaterThan(0);
      expect(listed.length).toBeLessThan(150);
      expect(listed).toEqual(before.nodes.slice(0, listed.length).map(({ id, type }) => ({ id, type })));
      expect(details).toMatchObject({ changedNodeCount: 150, 'before.nodeCount': 150 });
      expect(bytes(details)).toBeLessThanOrEqual(4096);
      expect(projected('resource_flow.updated', details)).not.toBeNull();
    });
  });

  it('stores Set variables, Set payload and name/value entries of credentials redacted', () => {
    const before: AuditCanvas = {
      nodes: [
        node('vars', { variables: [{ key: 'apiToken', value: 'S3CRET', scope: 'resource' }] }),
        node('payload', { entries: [{ key: 'headers.Authorization', value: 'Bearer S3CRET' }] }),
        node('named', { name: 'password', value: 'S3CRET' }),
        node('plain', { key: 'mode', value: 'on' }),
      ],
      edges: [],
    };
    const details = detailsFor(before, emptied);
    expect(JSON.stringify(details)).not.toContain('S3CRET');
    const data = Object.fromEntries(
      JSON.parse(details['before.snapshot'] as string).nodes.map((n: AuditFlowNode) => [n.id, n.data]),
    );
    expect(data).toEqual({
      vars: { variables: [{ key: 'apiToken', value: '[redacted]', scope: 'resource' }] },
      payload: { entries: [{ key: 'headers.Authorization', value: '[redacted]' }] },
      named: { name: 'password', value: '[redacted]' },
      plain: { key: 'mode', value: 'on' },
    });
  });
});

describe('redactFlowData in texts and header lists', () => {
  it('masks URL passwords and secret query parameters, and keeps other parameters', () => {
    expect(redactFlowData({ url: 'https://user:S3CRET@host/x?api_key=S3CRET&page=2' })).toEqual({
      url: 'https://user:[redacted]@host/x?api_key=[redacted]&page=2',
    });
  });

  it('masks every string inside an array under headers', () => {
    expect(
      redactFlowData({
        headers: ['Authorization: Bearer S3CRET', 'X-Plain: v'],
        request: { headers: [{ name: 'Cookie', value: 'S3CRET' }] },
      }),
    ).toEqual({
      headers: ['[redacted]', '[redacted]'],
      request: { headers: [{ name: '[redacted]', value: '[redacted]' }] },
    });
  });

  it('scans long texts in linear time', () => {
    const texts = ['a-'.repeat(50_000), 'a.'.repeat(50_000), '?'.repeat(100_000), '?a'.repeat(50_000)];
    const started = Date.now();
    for (const text of texts) expect(redactFlowData({ text })).toEqual({ text });
    // Quadratic scans took tens of seconds on these texts.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('keeps a plain key/value entry', () => {
    expect(redactFlowData({ entries: [{ key: 'mode', value: 'on' }] })).toEqual({
      entries: [{ key: 'mode', value: 'on' }],
    });
  });
});

describe('diffCanvas edge handles', () => {
  it('treats omitted handles like the null handles the database stores', () => {
    const stored = { id: 'e1', source: 'a', target: 'b', sourceHandle: null, targetHandle: null };
    const sent = { id: 'e1', source: 'a', target: 'b' };
    expect(
      diffCanvas({ nodes: [node('a'), node('b')], edges: [stored] }, { nodes: [node('a'), node('b')], edges: [sent] }),
    ).toBeNull();
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
