import { z } from 'zod';
import { FeatureFamily } from './constants';
import { capabilityReportSchema } from './capabilities';
import * as f from './families';

export type OperationDefinition = {
  id: string;
  family: FeatureFamily;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** OpenAPI-style path template. */
  path: string;
  /** Needs the release-compatibility headers. Health and version endpoints do not, so operators can troubleshoot. */
  versioned: boolean;
  summary: string;
  params?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  /** Physical effects: a timeout is reported as `uncertain` and is never retried automatically. */
  physical?: boolean;
};

/** `const T` keeps each `id` a string literal so `OperationId` is a union of the real operation IDs. */
const op = <const T extends OperationDefinition>(definition: T): T => definition;

const DEFINITIONS = [
  op({
    id: 'health.live',
    family: 'health',
    method: 'GET',
    path: '/health/live',
    versioned: false,
    summary: 'Liveness',
    response: f.liveResponseSchema,
  }),
  op({
    id: 'health.ready',
    family: 'health',
    method: 'GET',
    path: '/health/ready',
    versioned: false,
    summary: 'Readiness',
    response: f.readyResponseSchema,
  }),
  op({
    id: 'health.version',
    family: 'health',
    method: 'GET',
    path: '/version',
    versioned: false,
    summary: 'Build and release versions',
    response: f.versionResponseSchema,
  }),
  op({
    id: 'health.capabilities',
    family: 'health',
    method: 'GET',
    path: '/v1/capabilities',
    versioned: true,
    summary: 'Capability report',
    response: capabilityReportSchema,
  }),
  op({
    id: 'fabric.get',
    family: 'fabric',
    method: 'GET',
    path: '/v1/fabric',
    versioned: true,
    summary: 'Fabric status',
    response: f.fabricStatusSchema,
  }),
  op({
    id: 'fabric.create',
    family: 'fabric',
    method: 'POST',
    path: '/v1/fabric',
    versioned: true,
    summary: 'Create the fabric',
    body: f.fabricCreateRequestSchema,
    response: f.fabricStatusSchema,
    physical: true,
  }),
  op({
    id: 'commissioning.start',
    family: 'commissioning',
    method: 'POST',
    path: '/v1/commissioning/sessions',
    versioned: true,
    summary: 'Start commissioning',
    body: f.commissioningRequestSchema,
    response: f.commissioningSessionSchema,
    physical: true,
  }),
  op({
    id: 'commissioning.get',
    family: 'commissioning',
    method: 'GET',
    path: '/v1/commissioning/sessions/{sessionId}',
    versioned: true,
    summary: 'Commissioning session',
    params: f.sessionParamsSchema,
    response: f.commissioningSessionSchema,
  }),
  op({
    id: 'inventory.list',
    family: 'inventory',
    method: 'GET',
    path: '/v1/nodes',
    versioned: true,
    summary: 'List nodes',
    response: f.nodeListSchema,
  }),
  op({
    id: 'inventory.get',
    family: 'inventory',
    method: 'GET',
    path: '/v1/nodes/{nodeId}',
    versioned: true,
    summary: 'Get a node',
    params: f.nodeParamsSchema,
    response: f.nodeSchema,
  }),
  op({
    id: 'commands.invoke',
    family: 'commands',
    method: 'POST',
    path: '/v1/nodes/{nodeId}/commands',
    versioned: true,
    summary: 'Invoke a command',
    params: f.nodeParamsSchema,
    body: f.commandRequestSchema,
    response: f.commandResultSchema,
    physical: true,
  }),
  op({
    id: 'subscriptions.create',
    family: 'subscriptions',
    method: 'POST',
    path: '/v1/subscriptions',
    versioned: true,
    summary: 'Create a subscription',
    body: f.subscriptionRequestSchema,
    response: f.subscriptionSchema,
  }),
  op({
    id: 'subscriptions.delete',
    family: 'subscriptions',
    method: 'DELETE',
    path: '/v1/subscriptions/{subscriptionId}',
    versioned: true,
    summary: 'Close a subscription',
    params: f.subscriptionParamsSchema,
    response: f.subscriptionSchema,
  }),
  op({
    id: 'thread.get',
    family: 'thread',
    method: 'GET',
    path: '/v1/thread/network',
    versioned: true,
    summary: 'Thread network status',
    response: f.threadNetworkSchema,
  }),
  op({
    id: 'thread.set',
    family: 'thread',
    method: 'PUT',
    path: '/v1/thread/dataset',
    versioned: true,
    summary: 'Set the Thread dataset',
    body: f.threadDatasetRequestSchema,
    response: f.threadNetworkSchema,
    physical: true,
  }),
  op({
    id: 'ota.start',
    family: 'ota',
    method: 'POST',
    path: '/v1/ota/updates',
    versioned: true,
    summary: 'Start an OTA update',
    body: f.otaRequestSchema,
    response: f.otaUpdateSchema,
    physical: true,
  }),
  op({
    id: 'ota.get',
    family: 'ota',
    method: 'GET',
    path: '/v1/ota/updates/{updateId}',
    versioned: true,
    summary: 'OTA update status',
    params: f.otaParamsSchema,
    response: f.otaUpdateSchema,
  }),
];

export type OperationId = (typeof DEFINITIONS)[number]['id'];
export type TypedOperation = OperationDefinition & { id: OperationId };
export const OPERATIONS: readonly TypedOperation[] = DEFINITIONS;

export const EVENTS_PATH = '/v1/events';

export type OperationMatch = { operation: TypedOperation; params: Record<string, string> };

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function matchPath(template: string, path: string): Record<string, string> | null {
  const expected = template.split('/');
  const actual = path.split('/');
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index];
    if (segment.startsWith('{') && segment.endsWith('}')) {
      if (actual[index] === '') return null;
      const decoded = safeDecode(actual[index]);
      if (decoded === null) return null;
      params[segment.slice(1, -1)] = decoded;
    } else if (segment !== actual[index]) {
      return null;
    }
  }
  return params;
}

export type RouteLookup =
  { kind: 'match'; match: OperationMatch } | { kind: 'method-not-allowed' } | { kind: 'not-found' };

export function findOperation(method: string, path: string): RouteLookup {
  let pathExists = false;
  for (const operation of OPERATIONS) {
    const params = matchPath(operation.path, path);
    if (!params) continue;
    if (operation.method === method) return { kind: 'match', match: { operation, params } };
    pathExists = true;
  }
  return pathExists ? { kind: 'method-not-allowed' } : { kind: 'not-found' };
}
