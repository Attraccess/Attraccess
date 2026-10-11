import { SUPPORTED_RELEASE, INITIAL_CAPABILITIES, MATTER_JS_RELEASE } from './release.js';

export const fixtureId = '00000000-0000-4000-8000-000000000001';
export const fixtureTime = '2099-01-01T00:00:00.000Z';
const node = { fabricId: '0000000000000001', nodeId: 'ffffffffffffffff' };
const address = { ...node, endpointId: 1, clusterId: 6 };
const operation = { operationId: fixtureId, cancellationId: fixtureId, deadline: fixtureTime };
const outcome = { operationId: fixtureId, outcome: 'uncertain', reportedAt: fixtureTime, reason: 'connection_lost' };
const cursor = { streamInstanceId: fixtureId, sequence: 0 };
const device = { ...node, deviceId: fixtureId, label: 'Example light', endpoints: [{ endpointId: 1, clusters: [6] }] };
export const versionFixture = {
  schemaVersion: 1,
  build: { version: SUPPORTED_RELEASE.sidecar, revision: 'test-revision' },
  sidecarRelease: SUPPORTED_RELEASE.sidecar,
  matterJsRelease: MATTER_JS_RELEASE,
  storageSchemaVersion: 1,
  wireProtocolVersion: 1,
  supportedReleases: [SUPPORTED_RELEASE],
  capabilities: INITIAL_CAPABILITIES,
};
export const fixtures: Record<string, unknown> = {
  Id: fixtureId,
  UInt64: node.nodeId,
  Timestamp: fixtureTime,
  Sequence: 1,
  Release: '0.1.0',
  ReleaseTuple: SUPPORTED_RELEASE,
  Correlation: { requestId: null, operationId: null },
  Cursor: cursor,
  NodeIdentity: node,
  Address: address,
  AttributeAddress: { ...address, attributeId: 0 },
  CommandAddress: { ...address, commandId: 1 },
  Operation: operation,
  Empty: {},
  PublicValue: { kind: 'boolean', value: true },
  CapabilityName: 'commands',
  Capability: INITIAL_CAPABILITIES[0],
  Capabilities: INITIAL_CAPABILITIES,
  ErrorCode: 'TIMEOUT',
  Reconciliation: {
    reason: 'different_instance',
    snapshotAvailable: false,
    action:
      'Obtain an authoritative snapshot with a stream watermark, then resume after that watermark. Feature snapshots are unavailable in this foundation.',
  },
  ErrorEnvelope: {
    schemaVersion: 1,
    error: {
      code: 'TIMEOUT',
      message: 'Do not retry an ambiguous physical command.',
      requestId: fixtureId,
      operationId: fixtureId,
      retryable: false,
      details: {},
    },
  },
  CompatibilityHeaders: {
    'x-matter-wire-version': '1',
    'x-attraccess-version': SUPPORTED_RELEASE.attraccess,
    'x-matter-plugin-version': SUPPORTED_RELEASE.plugin,
    'x-request-id': fixtureId,
  },
  LiveResponse: { schemaVersion: 1, live: true },
  ReadyResponse: { schemaVersion: 1, ready: true, fabricInitialized: false, reason: null },
  VersionResponse: versionFixture,
  FabricStatus: { fabricId: node.fabricId, label: 'Example', nodeCount: 1 },
  FabricResponse: { fabrics: [{ fabricId: node.fabricId, label: 'Example', nodeCount: 1 }] },
  FabricRequest: { ...operation, action: 'create', fabricId: node.fabricId },
  CommissioningRequest: {
    ...operation,
    setupCode: '12345678901',
    network: { kind: 'wifi', ssid: 'example', password: 'request-only' },
  },
  OperationQuery: { operationId: fixtureId },
  CancelRequest: { operationId: fixtureId, cancellationId: fixtureId },
  Outcome: 'uncertain',
  OperationResponse: outcome,
  CommissioningProgress: { operationId: fixtureId, stage: 'discovering', progress: 0 },
  Device: device,
  InventoryResponse: {
    snapshotId: fixtureId,
    capturedAt: fixtureTime,
    watermark: cursor,
    authoritative: true,
    devices: [device],
  },
  CommandRequest: { ...operation, address: { ...address, commandId: 1 }, payload: { kind: 'onOff', on: true } },
  SubscriptionRequest: {
    ...operation,
    subscriptionId: fixtureId,
    attributes: [{ ...address, attributeId: 0 }],
    minIntervalSeconds: 1,
    maxIntervalSeconds: 10,
  },
  SubscriptionQuery: { subscriptionId: fixtureId },
  SubscriptionCancel: { subscriptionId: fixtureId, cancellationId: fixtureId },
  SubscriptionResponse: { subscriptionId: fixtureId, status: 'terminated', reason: 'connection_lost' },
  AttributeReport: {
    subscriptionId: fixtureId,
    address: { ...address, attributeId: 0 },
    value: { kind: 'boolean', value: true },
    reportedAt: fixtureTime,
  },
  DeviceEventReport: {
    subscriptionId: fixtureId,
    address,
    eventNumber: node.nodeId,
    eventCode: 0,
    reportedAt: fixtureTime,
    value: { kind: 'boolean', value: false },
  },
  ThreadStatus: { available: false, connected: false, datasetConfigured: false },
  ThreadRequest: { ...operation, dataset: '00aa' },
  OtaStatus: { available: false, activeOperationId: null },
  OtaRequest: {
    ...operation,
    device: node,
    approved: true,
    approvalId: fixtureId,
    image: { url: 'https://example.org/update.bin', sha256: 'a'.repeat(64), softwareVersion: 1 },
  },
  OtaProgress: { operationId: fixtureId, progress: 0, stage: 'transferring' },
  EventPayload: { type: 'command.outcome', payload: outcome },
  EventEnvelope: {
    eventId: fixtureId,
    schemaVersion: 1,
    timestamp: fixtureTime,
    correlation: { requestId: fixtureId, operationId: fixtureId },
    streamInstanceId: fixtureId,
    sequence: 1,
    type: 'command.outcome',
    payload: outcome,
  },
  ClientMessage: { schemaVersion: 1, type: 'resume', requestId: fixtureId, cursor },
  StreamReady: {
    schemaVersion: 1,
    type: 'stream.ready',
    requestId: fixtureId,
    watermark: cursor,
    delivery: 'at_least_once',
  },
};
fixtures.ServerMessage = fixtures.EventEnvelope;
