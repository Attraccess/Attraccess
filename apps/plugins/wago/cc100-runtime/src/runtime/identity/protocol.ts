import { BOUNDED_MESSAGES_CAPABILITY, CHANNEL_ENABLED_CAPABILITY } from '../../../../shared/capabilities';

export { BOUNDED_MESSAGES_CAPABILITY, CHANNEL_ENABLED_CAPABILITY };

/**
 * Measurements are published on change, with an unchanged reading re-sent at least every 30 s and after
 * every resync; a reading's sample can therefore be up to 30 s old. The wire format is unchanged.
 */
export const MEASUREMENT_ON_CHANGE_CAPABILITY = 'measurement-on-change-v1';

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
  BOUNDED_MESSAGES_CAPABILITY,
  CHANNEL_ENABLED_CAPABILITY,
  MEASUREMENT_ON_CHANGE_CAPABILITY,
];

export const CREDENTIAL_EPOCH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DiscoveryClaim = { username: string; password: string; prefix?: string; credentialEpoch?: string };
