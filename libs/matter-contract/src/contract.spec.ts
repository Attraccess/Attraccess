import {
  COMPATIBILITY_TABLE,
  ERROR_STATUS,
  FEATURE_FAMILIES,
  OPERATIONS,
  WIRE_VERSION,
  buildError,
  capabilityReportSchema,
  clientMessageSchema,
  commandRequestSchema,
  commissioningRequestSchema,
  correlationSchema,
  cursorSchema,
  errorEnvelopeSchema,
  eventEnvelopeSchema,
  findOperation,
  formatCursor,
  isWellFormedVersion,
  matterId64Schema,
  minimumAttraccessVersion,
  parseCursor,
  serverMessageSchema,
  subscriptionRequestSchema,
  threadDatasetRequestSchema,
} from './index';
import * as families from './families';

const id = '11111111-1111-4111-8111-111111111111';
const correlation = { correlationId: id, causationId: null, initiator: { userId: null, requestId: null } };
const event = {
  eventId: id,
  schemaVersion: 1,
  type: 'sidecar.lifecycle',
  timestamp: '2026-10-29T10:00:00.000Z',
  correlation,
  streamInstanceId: id,
  sequence: 1,
  payload: { phase: 'started' },
};

describe('primitives', () => {
  it('encodes 64-bit identifiers as validated decimal strings', () => {
    expect(matterId64Schema.safeParse('18446744073709551615').success).toBe(true);
    expect(matterId64Schema.safeParse('18446744073709551616').success).toBe(false);
    expect(matterId64Schema.safeParse('007').success).toBe(false);
    expect(matterId64Schema.safeParse(5).success).toBe(false);
    expect(matterId64Schema.safeParse('xyz').success).toBe(false);
  });

  it('requires a full correlation context', () => {
    expect(correlationSchema.safeParse(correlation).success).toBe(true);
    expect(correlationSchema.safeParse({ correlationId: 'nope' }).success).toBe(false);
  });

  it('rejects unknown fields everywhere', () => {
    expect(correlationSchema.safeParse({ ...correlation, extra: 1 }).success).toBe(false);
  });
});

describe('errors', () => {
  it('maps every code to a documented status', () => {
    expect(ERROR_STATUS).toMatchObject({
      validation_failed: 400,
      payload_too_large: 413,
      incompatible_release: 409,
      unsupported_wire_version: 426,
      unsupported_capability: 501,
      sidecar_unavailable: 503,
      timeout: 504,
    });
  });

  it('builds valid envelopes and never marks an uncertain outcome retryable', () => {
    const envelope = buildError('timeout', 'too slow', id, { outcome: 'uncertain', retryable: true });
    expect(errorEnvelopeSchema.parse(envelope).error).toMatchObject({ retryable: false, outcome: 'uncertain' });
    expect(buildError('sidecar_unavailable', 'x', id).error.retryable).toBe(true);
    expect(buildError('validation_failed', 'x', id, { details: { path: 'a' } }).error.details).toEqual({ path: 'a' });
  });
});

describe('capabilities and operations', () => {
  it('covers all eight families', () => {
    expect(FEATURE_FAMILIES).toHaveLength(8);
    for (const family of FEATURE_FAMILIES) {
      expect(OPERATIONS.some((operation) => operation.family === family)).toBe(true);
    }
  });

  it('validates a capability report', () => {
    const capabilities = FEATURE_FAMILIES.map((family) => ({ family, defined: true, available: false, reason: 'x' }));
    expect(capabilityReportSchema.safeParse({ capabilities }).success).toBe(true);
    expect(capabilityReportSchema.safeParse({ capabilities: capabilities.slice(1) }).success).toBe(false);
  });

  it('routes known paths and rejects unknown ones without fallthrough', () => {
    expect(findOperation('GET', '/v1/nodes/42')).toMatchObject({ kind: 'match' });
    expect(findOperation('POST', '/v1/nodes')).toEqual({ kind: 'method-not-allowed' });
    expect(findOperation('GET', '/v2/nodes')).toEqual({ kind: 'not-found' });
    expect(findOperation('GET', '/v1/nodes/%E0%A4%A')).toEqual({ kind: 'not-found' });
    expect(findOperation('GET', '/v1/nodes/')).toEqual({ kind: 'not-found' });
  });

  it('has unique operation ids and a spec per family example', () => {
    expect(new Set(OPERATIONS.map((operation) => operation.id)).size).toBe(OPERATIONS.length);
  });
});

describe('families', () => {
  it('validates the commissioning request and accepts secrets only in requests', () => {
    expect(commissioningRequestSchema.safeParse({ setupCode: '34970112332' }).success).toBe(true);
    expect(commissioningRequestSchema.safeParse({ setupCode: 'abc' }).success).toBe(false);
    expect(
      families.commissioningSessionSchema.safeParse({
        sessionId: id,
        state: 'pending',
        nodeId: null,
        outcome: 'requested',
      }).success,
    ).toBe(true);
    expect(Object.keys(families.commissioningSessionSchema.shape)).not.toContain('setupCode');
    expect(Object.keys(families.threadNetworkSchema.shape)).not.toContain('activeDataset');
    expect(threadDatasetRequestSchema.safeParse({ activeDataset: '0e08' }).success).toBe(true);
  });

  it('keeps the subscription interval invariant in the shared schema', () => {
    const base = { nodeId: '1', minIntervalSec: 1, maxIntervalSec: 5 };
    expect(subscriptionRequestSchema.safeParse(base).success).toBe(true);
    expect(subscriptionRequestSchema.safeParse({ ...base, minIntervalSec: 6 }).success).toBe(false);
  });

  it('keeps requested, accepted and reported outcomes distinct', () => {
    const request = { requestId: id, endpointId: 1, clusterId: 6, commandId: 1 };
    expect(commandRequestSchema.parse(request).payload).toEqual({});
    expect(commandRequestSchema.safeParse({ ...request, deadlineMs: 0 }).success).toBe(false);
    for (const outcome of ['requested', 'accepted', 'reported', 'uncertain']) {
      expect(
        families.commandResultSchema.safeParse({ requestId: id, outcome, acceptedAt: null, reportedAt: null }).success,
      ).toBe(true);
    }
  });

  it.each([
    ['fabric', families.fabricStatusSchema, { state: 'uninitialized', fabricId: null }],
    ['inventory', families.nodeListSchema, { authoritative: false, nodes: [] }],
    ['subscription', families.subscriptionSchema, { subscriptionId: id, nodeId: '1', state: 'active' }],
    ['ota', families.otaUpdateSchema, { updateId: id, nodeId: '1', state: 'queued', outcome: 'requested' }],
    [
      'version',
      families.versionResponseSchema,
      {
        build: { version: '1', commit: 'a' },
        sidecar: '1.0.0',
        matterJs: '0.18.0',
        storageSchemaVersion: 1,
        wireVersion: 1,
      },
    ],
  ])('accepts a valid %s example and rejects a broken one', (_name, schema, example) => {
    expect(schema.safeParse(example).success).toBe(true);
    expect(schema.safeParse({ ...example, unexpected: true }).success).toBe(false);
  });
});

describe('events and messages', () => {
  it('requires id, schema version, timestamp, correlation, stream and sequence', () => {
    expect(eventEnvelopeSchema.safeParse(event).success).toBe(true);
    for (const key of ['eventId', 'schemaVersion', 'timestamp', 'correlation', 'streamInstanceId', 'sequence']) {
      const rest: Record<string, unknown> = { ...event };
      delete rest[key];
      expect(eventEnvelopeSchema.safeParse(rest).success).toBe(false);
    }
    expect(eventEnvelopeSchema.safeParse({ ...event, timestamp: 'yesterday' }).success).toBe(false);
    expect(eventEnvelopeSchema.safeParse({ ...event, sequence: 0 }).success).toBe(false);
  });

  it('round-trips cursors and rejects malformed ones', () => {
    const cursor = formatCursor(id, 7);
    expect(cursorSchema.safeParse(cursor).success).toBe(true);
    expect(parseCursor(cursor)).toEqual({ streamInstanceId: id, sequence: 7 });
    expect(parseCursor('garbage')).toBeNull();
  });

  it('accepts only wire version 1 in client messages', () => {
    expect(clientMessageSchema.safeParse({ type: 'resume', wireVersion: WIRE_VERSION }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'resume', wireVersion: 2 }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'ping', wireVersion: 1, extra: 1 }).success).toBe(false);
  });

  it('validates server messages', () => {
    expect(serverMessageSchema.safeParse({ type: 'event', cursor: formatCursor(id, 1), event }).success).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'reconciliation-required',
        reason: 'evicted',
        snapshot: 'unavailable',
        streamInstanceId: id,
      }).success,
    ).toBe(true);
    expect(serverMessageSchema.safeParse({ type: 'error', ...buildError('timeout', 'x', id) }).success).toBe(true);
    expect(serverMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});

describe('compatibility table', () => {
  it('lists exactly one combination for wire version 1', () => {
    expect(COMPATIBILITY_TABLE).toHaveLength(1);
    expect(COMPATIBILITY_TABLE[0].wireVersion).toBe(WIRE_VERSION);
    expect(minimumAttraccessVersion()).toBe('1.11.0');
    expect(() => minimumAttraccessVersion({ ...COMPATIBILITY_TABLE[0], attraccess: '>=1' })).toThrow();
  });

  it('recognizes well-formed versions only', () => {
    expect(isWellFormedVersion('1.11.0')).toBe(true);
    expect(isWellFormedVersion('1.11.0-rc.1')).toBe(true);
    expect(isWellFormedVersion('v1.11.0')).toBe(false);
    expect(isWellFormedVersion('1.11.0\nX: y')).toBe(false);
    expect(isWellFormedVersion(undefined)).toBe(false);
    expect(isWellFormedVersion(`1.0.0-${'a'.repeat(80)}`)).toBe(false);
  });
});
