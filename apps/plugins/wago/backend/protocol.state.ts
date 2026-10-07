export const CONFIGURATION_PROTOCOL_VERSION = 1;

export const CONFIGURATION_CAPABILITY = `configuration-v${CONFIGURATION_PROTOCOL_VERSION}`;
export const DISCOVERY_ROOT = 'attraccess/wago/discovery';

export const REQUIRED_CAPABILITIES = ['claim', 'heartbeat', CONFIGURATION_CAPABILITY] as const;
export const SUPPORTED_PROTOCOL_MAJOR = 1;
