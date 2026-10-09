export const CAPABILITIES = [
  'claim',
  'claim-expiry-v1',
  'heartbeat',
  'configuration-v1',
  'commands',
  'state',
  'measurement',
  'fault',
  'acknowledgement',
  'credential-rotation-v1',
  'front-panel-v1',
  'runtime-update-gate-v1',
];

export const CREDENTIAL_EPOCH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DiscoveryClaim = { username: string; password: string; prefix?: string; credentialEpoch?: string };
