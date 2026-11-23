/** Resource actions that can be restricted to the allowed network. Extend this list to restrict more actions. */
export enum NetworkRestrictedAction {
  UsageStart = 'usage.start',
  UsageTakeover = 'usage.takeover',
  UsageEnd = 'usage.end',
  DoorOpen = 'door.open',
  DoorUnlock = 'door.unlock',
  DoorUnlatch = 'door.unlatch',
  DoorLock = 'door.lock',
  SupervisionRequest = 'supervision.request',
  SupervisionApprove = 'supervision.approve',
}

export const NETWORK_RESTRICTED_ACTIONS: readonly NetworkRestrictedAction[] = Object.values(NetworkRestrictedAction);

/** Where the caller's address comes from: the request's client IP, or a header written by the reverse proxy. */
export enum NetworkIpSource {
  Client = 'client',
  Header = 'header',
}

/** The stable error code of a 403 for an action that is not allowed from the caller's network. */
export const NETWORK_RESTRICTED_ERROR_CODE = 'NETWORK_RESTRICTED';

export const NETWORK_RESTRICTION_DEFAULT_RANGES: readonly string[] = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

export const NETWORK_RESTRICTION_DEFAULT_HEADER = 'X-Real-Ip';
