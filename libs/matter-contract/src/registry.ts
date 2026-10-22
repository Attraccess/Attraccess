import { z } from 'zod';
import * as primitives from './primitives.js';
import * as features from './features.js';
import * as events from './events.js';
import * as releases from './release.js';

export const schemas = {
  ...Object.fromEntries(Object.entries(primitives).filter(([, value]) => value instanceof z.ZodType)),
  ...features,
  ...events,
  ...Object.fromEntries(Object.entries(releases).filter(([, value]) => value instanceof z.ZodType)),
} as Record<string, z.ZodType>;
export const routes = [
  { method: 'GET', path: '/health/live', response: 'LiveResponse' },
  { method: 'GET', path: '/health/ready', response: 'ReadyResponse' },
  { method: 'GET', path: '/version', response: 'VersionResponse' },
  { method: 'GET', path: '/v1/capabilities', response: 'Capabilities' },
  { method: 'GET', path: '/v1/fabrics', response: 'FabricResponse', capability: 'fabric' },
  {
    method: 'POST',
    path: '/v1/fabrics',
    request: 'FabricRequest',
    response: 'OperationResponse',
    capability: 'fabric',
  },
  {
    method: 'POST',
    path: '/v1/commissioning/start',
    request: 'CommissioningRequest',
    response: 'OperationResponse',
    capability: 'commissioning',
  },
  {
    method: 'POST',
    path: '/v1/commissioning/status',
    request: 'OperationQuery',
    response: 'OperationResponse',
    capability: 'commissioning',
  },
  {
    method: 'POST',
    path: '/v1/commissioning/cancel',
    request: 'CancelRequest',
    response: 'OperationResponse',
    capability: 'commissioning',
  },
  { method: 'GET', path: '/v1/inventory', response: 'InventoryResponse', capability: 'inventory' },
  {
    method: 'POST',
    path: '/v1/commands',
    request: 'CommandRequest',
    response: 'OperationResponse',
    capability: 'commands',
  },
  {
    method: 'POST',
    path: '/v1/subscriptions',
    request: 'SubscriptionRequest',
    response: 'SubscriptionResponse',
    capability: 'subscriptions',
  },
  {
    method: 'POST',
    path: '/v1/subscriptions/status',
    request: 'SubscriptionQuery',
    response: 'SubscriptionResponse',
    capability: 'subscriptions',
  },
  {
    method: 'POST',
    path: '/v1/subscriptions/cancel',
    request: 'SubscriptionCancel',
    response: 'SubscriptionResponse',
    capability: 'subscriptions',
  },
  { method: 'GET', path: '/v1/thread', response: 'ThreadStatus', capability: 'thread' },
  {
    method: 'POST',
    path: '/v1/thread/dataset',
    request: 'ThreadRequest',
    response: 'OperationResponse',
    capability: 'thread',
  },
  { method: 'GET', path: '/v1/ota', response: 'OtaStatus', capability: 'ota' },
  { method: 'POST', path: '/v1/ota', request: 'OtaRequest', response: 'OperationResponse', capability: 'ota' },
] as const;
