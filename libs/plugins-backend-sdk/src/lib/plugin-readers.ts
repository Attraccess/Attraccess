/**
 * Plugin readers (permission `READER_DEVICES`).
 *
 * A plugin reader is a card reader that a plugin owns, for example an NFC reader built into a device the plugin
 * talks to. It behaves like an Attractap reader without a display: an administrator assigns it a resource, and a
 * card held to it runs the one action its capabilities allow on that resource, with the same checks, usage record,
 * flows and audit as the same action on an Attractap reader.
 *
 * The plugin never acts on a bare user id. It authenticates the card held to its device with `context.cards`
 * (which returns a single-use authentication for that device) and hands that authentication to `tap`.
 */

/** Resource types a plugin reader may be assigned to. Only doors for now. */
export const PLUGIN_READER_RESOURCE_TYPES = ['door'] as const;
export type PluginReaderResourceType = (typeof PLUGIN_READER_RESOURCE_TYPES)[number];

/**
 * Actions a plugin reader may run. `open` is the only action of a door with the "access only" option: it is stored
 * and reported like an unlock (`DoorUnlock`, the door-unlocked flow trigger).
 */
export const PLUGIN_READER_ACTIONS = ['open'] as const;
export type PluginReaderAction = (typeof PLUGIN_READER_ACTIONS)[number];

/** What a plugin reader may do. The host refuses assignments and taps outside it. */
export interface PluginReaderCapabilities {
  /** Non-empty, no duplicates. */
  resourceTypes: PluginReaderResourceType[];
  /** Non-empty, no duplicates. A reader runs the first action its assigned resource allows. */
  actions: PluginReaderAction[];
}

/** Host caps. */
export const PLUGIN_READER_LIMITS = {
  /** Readers per plugin. */
  maxReaders: 200,
  deviceIdMaxLength: 200,
  nameMaxLength: 100,
  /** Resources one reader can be assigned to. */
  maxResources: 1,
  /** How long the authentication from `cards.authenticate` stays valid for `tap`. */
  authenticationTtlMs: 30_000,
} as const;

export interface PluginReaderInput {
  /**
   * Plugin-chosen id of the device, 1 to 200 characters without control characters, unique per plugin. Use the same id as `device` in
   * `cards.authenticate`: a tap only accepts an authentication from the same device.
   */
  deviceId: string;
  /** Shown to administrators, 1 to 100 characters without control characters. */
  name: string;
  capabilities: PluginReaderCapabilities;
}

export interface PluginReaderUpdate {
  name?: string;
  /** Narrowing the capabilities unassigns a resource they no longer allow. */
  capabilities?: PluginReaderCapabilities;
}

export interface PluginReader {
  deviceId: string;
  name: string;
  capabilities: PluginReaderCapabilities;
  /** The assigned resource, or null. */
  resourceId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Stable error codes of the reader management calls. Never renamed or removed. */
export const PluginReaderErrorCode = {
  /** A device id, name or capability set that does not pass validation. */
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  /** No reader with this device id for this plugin. */
  READER_NOT_FOUND: 'READER_NOT_FOUND',
  /** The plugin already has `PLUGIN_READER_LIMITS.maxReaders` readers. */
  LIMIT_REACHED: 'LIMIT_REACHED',
  /** No resource with this id. */
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  /** The reader's capabilities do not allow this resource (its type, or none of its actions). */
  RESOURCE_NOT_ALLOWED: 'RESOURCE_NOT_ALLOWED',
} as const;
export type PluginReaderErrorCode = (typeof PluginReaderErrorCode)[keyof typeof PluginReaderErrorCode];

/** Thrown (rejected) by the reader management calls. Permission failures stay `PluginPermissionError`. */
export class PluginReaderError extends Error {
  public readonly code: PluginReaderErrorCode;

  constructor(code: PluginReaderErrorCode, message: string) {
    super(message);
    this.name = 'PluginReaderError';
    this.code = code;
  }
}

/** Stable reasons a tap was refused. Never renamed or removed. */
export const PluginReaderTapFailureReason = {
  /** No reader with this device id for this plugin. */
  READER_NOT_FOUND: 'READER_NOT_FOUND',
  /** The reader has no resource assigned. */
  NO_RESOURCE: 'NO_RESOURCE',
  /** None of the reader's actions is allowed on its resource (for example the door is no longer "access only"). */
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  /**
   * The card owner may not use the resource (no permission, no introduction, account blocked), or the card was
   * deactivated or removed since it was authenticated.
   */
  ACCESS_DENIED: 'ACCESS_DENIED',
  /** The resource is under maintenance. */
  MAINTENANCE: 'MAINTENANCE',
  /** The authentication is older than `PLUGIN_READER_LIMITS.authenticationTtlMs`. Authenticate the card again. */
  AUTHENTICATION_EXPIRED: 'AUTHENTICATION_EXPIRED',
  /** The authentication is unknown, already used, or from another device or plugin. */
  AUTHENTICATION_INVALID: 'AUTHENTICATION_INVALID',
  /**
   * Another tap on this reader is still running. This tap consumed its authentication too: a retry needs a new
   * `cards.authenticate`.
   */
  BUSY: 'BUSY',
  /**
   * The action was recorded for the card owner, but a flow attached to it failed. Do not retry: a retry records the
   * action again.
   */
  FLOW_FAILED: 'FLOW_FAILED',
} as const;
export type PluginReaderTapFailureReason =
  (typeof PluginReaderTapFailureReason)[keyof typeof PluginReaderTapFailureReason];

export interface PluginReaderTapRequest {
  deviceId: string;
  /** `card.authentication` from a successful `cards.authenticate` with `device` equal to `deviceId`. Single use. */
  authentication: string;
}

export type PluginReaderTapResult =
  | {
      ok: true;
      action: PluginReaderAction;
      resourceId: number;
      /** The card owner the action was recorded for. */
      userId: number;
    }
  | { ok: false; reason: PluginReaderTapFailureReason };

/** `context.readers`. Requires the `READER_DEVICES` permission. */
export interface PluginReadersContext {
  /** Creates the reader, or updates name and capabilities of an existing one with the same device id. */
  register(input: PluginReaderInput): Promise<PluginReader>;
  update(deviceId: string, update: PluginReaderUpdate): Promise<PluginReader>;
  /** Removes the reader and its assignment. Idempotent. */
  remove(deviceId: string): Promise<void>;
  /** Null when there is no such reader. */
  get(deviceId: string): Promise<PluginReader | null>;
  list(): Promise<PluginReader[]>;
  /**
   * Assigns the reader its resource, replacing a previous one. Rejects with `RESOURCE_NOT_ALLOWED` when the
   * capabilities allow neither the resource type nor any of its actions (a door must be "access only" for `open`).
   */
  assignResource(deviceId: string, resourceId: number): Promise<PluginReader>;
  /** Idempotent. */
  unassignResource(deviceId: string): Promise<PluginReader>;
  /**
   * A card authenticated on the reader's device was held to it: runs the reader's action on its resource for the
   * card owner, with the same checks as on an Attractap reader. Consumes the authentication, also on a refusal.
   * Resolves for every outcome; rejects only on a host failure (a generic `Error`; retry later) or an invalid
   * request (`TypeError`).
   */
  tap(request: PluginReaderTapRequest): Promise<PluginReaderTapResult>;
}
