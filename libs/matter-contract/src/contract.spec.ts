import {
  COMPATIBILITY_TABLE,
  ERROR_STATUS,
  FEATURE_FAMILIES,
  MAX_BACKUP_BODY_BYTES,
  MAX_MESSAGE_BYTES,
  OPERATIONS,
  SERVICE_TOKEN_PATTERN,
  WIRE_VERSION,
  buildError,
  buildRequestHeaders,
  expectedSidecarVersion,
  isHostSupported,
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
      unauthorized: 401,
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
  it('covers all nine families', () => {
    expect(FEATURE_FAMILIES).toHaveLength(9);
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

  it('caps device type IDs at uint32', () => {
    const base = { endpointId: 1, parentEndpointId: null, clusters: [], bridged: null };
    expect(
      families.endpointSchema.safeParse({ ...base, deviceTypes: [{ deviceTypeId: 0xffff_ffff, revision: 1 }] }).success,
    ).toBe(true);
    expect(
      families.endpointSchema.safeParse({ ...base, deviceTypes: [{ deviceTypeId: 0x1_0000_0000, revision: 1 }] })
        .success,
    ).toBe(false);
    expect(families.endpointSchema.safeParse({ ...base, deviceTypes: [0xffff_ffff] }).success).toBe(false);
  });

  it('describes the inventory with identity, bounded clusters and bridged data', () => {
    const node = {
      nodeId: '5',
      reachable: true,
      vendorId: 4_874,
      productId: 1,
      vendorName: 'Acme',
      productName: 'Plug',
      serialNumber: 'SN1',
      uniqueId: 'U1',
      hardwareVersion: 1,
      softwareVersion: 3,
      softwareVersionString: '1.0.3',
      attestation: { status: 'verified', checkedAt: '2026-10-29T10:00:00.000Z' },
      observedAt: null,
      endpoints: [
        {
          endpointId: 1,
          parentEndpointId: 0,
          deviceTypes: [{ deviceTypeId: 266, revision: 1 }],
          clusters: [
            { clusterId: 6, role: 'server', revision: 5, featureMap: 1, attributeIds: [0], acceptedCommandIds: [0, 1] },
          ],
          bridged: {
            uniqueId: 'B1',
            nodeLabel: null,
            vendorName: null,
            productName: null,
            serialNumber: null,
            reachable: true,
          },
        },
      ],
    };
    expect(families.nodeListSchema.safeParse({ authoritative: true, fabricId: '1', nodes: [node] }).success).toBe(true);
    expect(families.nodeListSchema.safeParse({ authoritative: true, fabricId: null, nodes: [] }).success).toBe(true);
    expect(families.nodeListSchema.safeParse({ authoritative: true, nodes: [] }).success).toBe(false);
    expect(families.nodeSchema.safeParse({ ...node, attestation: { status: 'bogus', checkedAt: null } }).success).toBe(
      false,
    );
    const cluster = node.endpoints[0].clusters[0];
    const oversized = { ...node.endpoints[0], clusters: [{ ...cluster, attributeIds: new Array(513).fill(1) }] };
    expect(families.endpointSchema.safeParse(oversized).success).toBe(false);
  });

  it('keeps the subscription interval invariant in the shared schema', () => {
    const base = { nodeId: '1', minIntervalSec: 1, maxIntervalSec: 5 };
    expect(subscriptionRequestSchema.safeParse(base).success).toBe(true);
    expect(subscriptionRequestSchema.safeParse({ ...base, minIntervalSec: 6 }).success).toBe(false);
  });

  it('adds the backup family with its own body limit and secrets-on-wire marking', () => {
    const backupOperations = OPERATIONS.filter((operation) => operation.family === 'backup');
    expect(backupOperations.map((operation) => operation.id)).toEqual([
      'backup.snapshot',
      'backup.restore.stage',
      'backup.restore.commit',
      'backup.restore.rollback',
      'backup.restore.finalize',
      'backup.restore.abort',
    ]);
    for (const operation of backupOperations) expect(operation.secretsOnWire).toBe(true);
    expect(MAX_BACKUP_BODY_BYTES).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(OPERATIONS.find((operation) => operation.id === 'backup.snapshot')?.bodyLimitBytes).toBe(
      MAX_BACKUP_BODY_BYTES,
    );
    expect(MAX_MESSAGE_BYTES).toBe(1024 * 1024);
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
    [
      'fabric',
      families.fabricStatusSchema,
      {
        state: 'uninitialized',
        reason: null,
        fabricId: null,
        fabricGeneration: 0,
        rootCertFingerprint: null,
        storageInstanceId: null,
        storageSchemaVersion: 1,
      },
    ],
    ['inventory', families.nodeListSchema, { authoritative: false, fabricId: null, nodes: [] }],
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

  it('validates device.state and command.outcome payloads by type', () => {
    const state = {
      nodeId: '5',
      endpointId: 1,
      clusterId: 6,
      attributeId: 0,
      value: true,
      observedAt: '2026-10-29T10:00:00.000Z',
      source: 'subscription_report',
    };
    expect(eventEnvelopeSchema.safeParse({ ...event, type: 'device.state', payload: state }).success).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({
        ...event,
        type: 'device.state',
        payload: { ...state, fault: { code: 'x', message: 'y' } },
      }).success,
    ).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({ ...event, type: 'device.state', payload: { ...state, fabricId: '1' } }).success,
    ).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({ ...event, type: 'device.state', payload: { ...state, fabricId: 'x' } }).success,
    ).toBe(false);
    expect(eventEnvelopeSchema.safeParse({ ...event, type: 'device.state', payload: { nodeId: '5' } }).success).toBe(
      false,
    );
    expect(
      eventEnvelopeSchema.safeParse({ ...event, type: 'device.state', payload: { phase: 'started' } }).success,
    ).toBe(false);
    const outcome = {
      requestId: id,
      outcome: 'accepted',
      acceptedAt: null,
      reportedAt: null,
      nodeId: '5',
      endpointId: 1,
    };
    expect(eventEnvelopeSchema.safeParse({ ...event, type: 'command.outcome', payload: outcome }).success).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({
        ...event,
        type: 'command.outcome',
        payload: { ...outcome, fabricId: '1', failureCode: 'timeout' },
      }).success,
    ).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({ ...event, type: 'command.outcome', payload: { ...outcome, outcome: 'done' } })
        .success,
    ).toBe(false);
    // Types without an implementation keep the opaque slot.
    expect(eventEnvelopeSchema.safeParse({ ...event, type: 'fabric.changed', payload: { anything: 1 } }).success).toBe(
      true,
    );
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
    expect(minimumAttraccessVersion({ ...COMPATIBILITY_TABLE[0], attraccess: '>=1.12.0 <2' })).toBe('1.12.0');
    expect(() => minimumAttraccessVersion({ ...COMPATIBILITY_TABLE[0], attraccess: 'not a range' })).toThrow();
    expect(() => minimumAttraccessVersion({ ...COMPATIBILITY_TABLE[0], attraccess: '<0.0.0' })).toThrow();
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

describe('client helpers', () => {
  it('pairs a plugin release with its sidecar release and checks the host range', () => {
    const entry = COMPATIBILITY_TABLE[0];
    expect(expectedSidecarVersion(entry.plugin)).toBe(entry.sidecar);
    expect(expectedSidecarVersion('9.9.9')).toBeUndefined();
    expect(isHostSupported(entry.plugin, '1.11.0')).toBe(true);
    expect(isHostSupported(entry.plugin, '1.10.0')).toBe(false);
    expect(isHostSupported('9.9.9', '1.11.0')).toBe(false);
  });

  it('builds the full header set with a bearer token only when given', () => {
    const base = {
      attraccessVersion: '1.11.0',
      pluginVersion: '0.4.0-alpha.0',
      sidecarVersion: '0.4.0-alpha.0',
      correlationId: id,
    };
    expect(buildRequestHeaders({ ...base, deadlineMs: 1500.2, token: 'x'.repeat(32) })).toEqual({
      'x-matter-wire-version': '1',
      'x-attraccess-version': '1.11.0',
      'x-matter-plugin-version': '0.4.0-alpha.0',
      'x-matter-sidecar-version': '0.4.0-alpha.0',
      'x-correlation-id': id,
      'x-request-deadline-ms': '1501',
      authorization: `Bearer ${'x'.repeat(32)}`,
    });
    expect(buildRequestHeaders(base).authorization).toBeUndefined();
  });

  it('accepts only 32-512 printable ASCII characters as a service token', () => {
    expect(SERVICE_TOKEN_PATTERN.test('a'.repeat(32))).toBe(true);
    expect(SERVICE_TOKEN_PATTERN.test('a'.repeat(512))).toBe(true);
    expect(SERVICE_TOKEN_PATTERN.test('a'.repeat(31))).toBe(false);
    expect(SERVICE_TOKEN_PATTERN.test('a'.repeat(513))).toBe(false);
    expect(SERVICE_TOKEN_PATTERN.test(`${'a'.repeat(31)} `)).toBe(false);
    expect(SERVICE_TOKEN_PATTERN.test(`${'a'.repeat(31)}é`)).toBe(false);
  });
});
