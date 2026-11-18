import { ResourceType } from '@attraccess/application-models';

/** What a reader can do on its resource. `open` is the only action of an access-only door (stored as a door unlock). */
export type ReaderAction = 'start' | 'stop' | 'lock' | 'unlock' | 'unlatch' | 'open';

/** The resource types a kind of reader can serve and the actions it can trigger on them. */
export interface ReaderCapabilities {
  resourceTypes: ResourceType[];
  actions: ReaderAction[];
}

/** The resource fields that decide which reader actions a resource allows. */
export interface ReaderCapabilityResource {
  type: ResourceType;
  separateUnlockAndUnlatch?: boolean | null;
  accessOnly?: boolean | null;
}

export const ACCESS_ONLY_DOOR_MESSAGE = 'This door is access only: it can only be opened';

/** Attractaps serve machines and every kind of door. */
export const ATTRACTAP_READER_CAPABILITIES: ReaderCapabilities = {
  resourceTypes: [ResourceType.Machine, ResourceType.Door],
  actions: ['start', 'stop', 'lock', 'unlock', 'unlatch', 'open'],
};

/** The Attractap BLE Bridge has no NFC: it carries plugin Bluetooth traffic and serves no resource. */
export const BLE_BRIDGE_READER_CAPABILITIES: ReaderCapabilities = { resourceTypes: [], actions: [] };

export const BLE_BRIDGE_MESSAGE = 'This reader is a Bluetooth bridge and cannot serve resources';

/** Whether an Attractap is a BLE Bridge. Firmware before 2.7.0 does not report `nfc`; those readers have NFC. */
export function isBleBridge(reader: { firmware?: { capabilities?: { nfc?: boolean } | null } | null }): boolean {
  return reader.firmware?.capabilities?.nfc === false;
}

/** The capabilities of an Attractap, from the firmware it reported. */
export function attractapReaderCapabilities(reader: Parameters<typeof isBleBridge>[0]): ReaderCapabilities {
  return isBleBridge(reader) ? BLE_BRIDGE_READER_CAPABILITIES : ATTRACTAP_READER_CAPABILITIES;
}

/** The actions a resource allows, whatever reader triggers them. */
export function readerActionsFor(resource: ReaderCapabilityResource): ReaderAction[] {
  if (resource.type === ResourceType.Machine) return ['start', 'stop'];
  if (resource.type !== ResourceType.Door) return [];
  if (resource.accessOnly) return ['open'];
  return resource.separateUnlockAndUnlatch ? ['lock', 'unlock', 'unlatch'] : ['lock', 'unlock'];
}

/** The actions a reader with these capabilities can trigger on the resource. */
export function allowedReaderActions(caps: ReaderCapabilities, resource: ReaderCapabilityResource): ReaderAction[] {
  if (!caps.resourceTypes.includes(resource.type)) return [];
  return readerActionsFor(resource).filter((action) => caps.actions.includes(action));
}

/** Whether a reader with these capabilities can be assigned to the resource. */
export function canAssign(caps: ReaderCapabilities, resource: ReaderCapabilityResource): boolean {
  return allowedReaderActions(caps, resource).length > 0;
}

/**
 * The action a request stands for on this resource. Readers that predate access-only doors send `unlock` for
 * Open, so an unlock on an access-only door is its Open.
 */
export function effectiveReaderAction(action: ReaderAction, resource: ReaderCapabilityResource): ReaderAction {
  return action === 'unlock' && resource.type === ResourceType.Door && resource.accessOnly ? 'open' : action;
}

/** Why a reader with these capabilities may not trigger the action on the resource, or null when it may. */
export function readerActionRefusal(
  caps: ReaderCapabilities,
  resource: ReaderCapabilityResource,
  requested: ReaderAction,
): string | null {
  const action = effectiveReaderAction(requested, resource);
  if (allowedReaderActions(caps, resource).includes(action)) return null;
  if (caps === BLE_BRIDGE_READER_CAPABILITIES) return BLE_BRIDGE_MESSAGE;
  if (!caps.resourceTypes.includes(resource.type)) return 'This reader cannot serve this resource';
  if (resource.type === ResourceType.Door && resource.accessOnly) return ACCESS_ONLY_DOOR_MESSAGE;
  if (action === 'unlatch' && resource.type === ResourceType.Door) return 'This door does not support unlatching';
  return 'This resource does not support this action';
}
