import { z } from 'zod';
import metadata from '../package.json' with { type: 'json' };
import { Capabilities, ReleaseTuple, WIRE_VERSION, STORAGE_SCHEMA_VERSION, Id } from './primitives.js';

// Package releases are authoritative. Builds and plugin manifest checks use this same policy.
export const SUPPORTED_RELEASE = ReleaseTuple.parse(metadata.attraccessMatter.supportedRelease);
export const MATTER_JS_RELEASE = metadata.attraccessMatter.matterJsRelease;
export const INITIAL_CAPABILITIES = Capabilities.parse(
  ['fabric', 'commissioning', 'inventory', 'commands', 'subscriptions', 'thread', 'ota'].map((name) => ({
    name,
    contractSupported: true,
    available: false,
    reason: 'Not implemented in this foundation.',
  })),
);
export const CompatibilityHeaders = z.strictObject({
  'x-matter-wire-version': z.literal('1'),
  'x-attraccess-version': z.literal(SUPPORTED_RELEASE.attraccess),
  'x-matter-plugin-version': z.literal(SUPPORTED_RELEASE.plugin),
  'x-request-id': Id,
});
export const VersionResponse = z.strictObject({
  schemaVersion: z.literal(WIRE_VERSION),
  build: z.strictObject({ version: z.literal(SUPPORTED_RELEASE.sidecar), revision: z.string().min(1).max(100) }),
  sidecarRelease: z.literal(SUPPORTED_RELEASE.sidecar),
  matterJsRelease: z.literal(MATTER_JS_RELEASE),
  storageSchemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  wireProtocolVersion: z.literal(WIRE_VERSION),
  supportedReleases: z.array(ReleaseTuple).length(1),
  capabilities: Capabilities,
});
export const LiveResponse = z.strictObject({ schemaVersion: z.literal(1), live: z.literal(true) });
export const ReadyResponse = z.strictObject({
  schemaVersion: z.literal(1),
  ready: z.boolean(),
  fabricInitialized: z.literal(false),
  reason: z.string().max(256).nullable(),
});
