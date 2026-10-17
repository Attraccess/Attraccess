import { z } from 'zod';
import {
  Id,
  UInt64,
  Timestamp,
  Operation,
  NodeIdentity,
  Address,
  AttributeAddress,
  CommandAddress,
  Cursor,
  PublicValue,
} from './primitives.js';

export const FabricStatus = z.strictObject({
  fabricId: UInt64,
  label: z.string().max(64),
  nodeCount: z.number().int().min(0).max(10000),
});
export const FabricResponse = z.strictObject({ fabrics: z.array(FabricStatus).max(100) });
export const FabricRequest = Operation.extend({ action: z.enum(['create', 'remove']), fabricId: UInt64 });
export const CommissioningRequest = Operation.extend({
  setupCode: z.string().regex(/^(?:\d{11}|\d{21}|MT:[A-Z0-9.-]{1,128})$/),
  network: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('wifi'), ssid: z.string().min(1).max(32), password: z.string().max(64) }),
      z.strictObject({ kind: z.literal('thread'), dataset: z.string().regex(/^(?:[0-9a-f]{2}){1,254}$/) }),
    ])
    .optional(),
});
export const OperationQuery = z.strictObject({ operationId: Id });
export const CancelRequest = z.strictObject({ operationId: Id, cancellationId: Id });
export const Outcome = z.enum(['requested', 'accepted', 'completed', 'failed', 'uncertain', 'cancelled']);
export const OperationResponse = z.strictObject({
  operationId: Id,
  outcome: Outcome,
  reportedAt: Timestamp,
  reason: z.enum(['none', 'rejected', 'deadline', 'connection_lost', 'cancelled']),
});
export const CommissioningProgress = z.strictObject({
  operationId: Id,
  stage: z.enum(['discovering', 'connecting', 'commissioning', 'verifying']),
  progress: z.number().min(0).max(1),
});
export const Device = NodeIdentity.extend({
  deviceId: Id,
  label: z.string().max(64),
  endpoints: z
    .array(
      z.strictObject({
        endpointId: z.number().int().min(0).max(65535),
        clusters: z.array(z.number().int().min(0).max(0xffffffff)).max(256),
      }),
    )
    .max(256),
});
export const InventoryResponse = z.strictObject({
  snapshotId: Id,
  capturedAt: Timestamp,
  watermark: Cursor,
  authoritative: z.literal(true),
  devices: z.array(Device).max(10000),
});
export const CommandRequest = Operation.extend({
  address: CommandAddress,
  payload: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('onOff'), on: z.boolean() }),
    z.strictObject({ kind: z.literal('level'), level: z.number().int().min(0).max(254) }),
  ]),
});
export const SubscriptionRequest = Operation.extend({
  subscriptionId: Id,
  attributes: z.array(AttributeAddress).min(1).max(256),
  minIntervalSeconds: z.number().int().min(0).max(3600),
  maxIntervalSeconds: z.number().int().min(1).max(3600),
}).refine((request) => request.minIntervalSeconds <= request.maxIntervalSeconds, {
  message: 'Minimum subscription interval must not exceed the maximum.',
  path: ['minIntervalSeconds'],
});
export const SubscriptionQuery = z.strictObject({ subscriptionId: Id });
export const SubscriptionCancel = SubscriptionQuery.extend({ cancellationId: Id });
export const SubscriptionResponse = SubscriptionQuery.extend({
  status: z.enum(['accepted', 'active', 'terminated']),
  reason: z.enum(['none', 'cancelled', 'connection_lost', 'expired', 'unsupported']),
});
export const AttributeReport = SubscriptionQuery.extend({
  address: AttributeAddress,
  value: PublicValue,
  reportedAt: Timestamp,
});
export const DeviceEventReport = SubscriptionQuery.extend({
  address: Address,
  eventNumber: UInt64,
  eventCode: z.number().int().min(0).max(0xffffffff),
  reportedAt: Timestamp,
  value: PublicValue,
});
export const ThreadStatus = z.strictObject({
  available: z.boolean(),
  connected: z.boolean(),
  datasetConfigured: z.boolean(),
});
// Dataset is request-only; statuses and events contain no dataset bytes.
export const ThreadRequest = Operation.extend({ dataset: z.string().regex(/^(?:[0-9a-f]{2}){1,254}$/) });
export const OtaStatus = z.strictObject({ available: z.boolean(), activeOperationId: Id.nullable() });

// Define URL syntax once as an exportable ASCII URI grammar. International
// domains use punycode; path/query text uses percent encoding. Do not normalize
// URLs with WHATWG parsing, whose acceptance rules differ from URI validators.
const uriCharacter = "(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})";
const dnsLabel = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
// WHATWG interprets a numeric final label as IPv4, even in an otherwise DNS host.
const dnsHost = `(?!(?:${dnsLabel}\\.)*(?:[0-9]+|0[xX][0-9A-Fa-f]*)\\.?(?=[:/?#]|$))${dnsLabel}(?:\\.${dnsLabel})*\\.?`;
const ipv4 = z.regexes.ipv4.source.slice(1, -1);
const ipv6 = z.regexes.ipv6.source.slice(1, -1);
// URI format alone allows arbitrary port numbers. Keep the wire range explicit.
const port = '0*(?:[0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])';
const httpsImageUrlPattern = new RegExp(
  `^[hH][tT][tT][pP][sS]://(?:(?:${uriCharacter}|:)*@)?(?:${ipv4}|\\[${ipv6}\\]|${dnsHost})` +
    `(?::${port})?(?:/(?:${uriCharacter}|[:@/])*)?(?:\\?(?:${uriCharacter}|[:@/?])*)?` +
    `(?:#(?:${uriCharacter}|[:@/?])*)?(?![\\s\\S])`,
);
export const OtaRequest = Operation.extend({
  device: NodeIdentity,
  approved: z.literal(true),
  approvalId: Id,
  image: z.strictObject({
    // The pattern enforces URL validity at runtime and in exports. URI format
    // remains explicit metadata rather than being replaced by Zod's regex check.
    url: z.string().regex(httpsImageUrlPattern).meta({
      format: 'uri',
      description:
        'HTTPS URI with a DNS/punycode, dotted-decimal IPv4 or hexadecimal IPv6 host; port 0–65535; percent-encoded text.',
    }),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    softwareVersion: z.number().int().min(0).max(0xffffffff),
  }),
});
export const OtaProgress = z.strictObject({
  operationId: Id,
  progress: z.number().min(0).max(1),
  stage: z.enum(['transferring', 'applying', 'verifying']),
});
