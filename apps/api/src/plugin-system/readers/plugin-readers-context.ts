import {
  PLUGIN_READER_ACTIONS,
  PLUGIN_READER_LIMITS,
  PLUGIN_READER_RESOURCE_TYPES,
  PluginReaderCapabilities,
  PluginReaderError,
  PluginReadersContext,
} from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { printable } from '../../audit/policies/projection';
import { isPluginRemoved, REMOVED_PLUGIN_MESSAGE } from '../runtime/removed-plugins';
import type { PluginReaderChanges, PluginReadersService } from './plugin-readers.service';

const logger = new Logger('PluginModule');

/** Longest handle the host accepts; issued handles are 43 characters. */
const MAX_AUTHENTICATION_LENGTH = 256;

const invalid = (message: string) => new PluginReaderError('INVALID_ARGUMENT', message);

/** Non-blank, and passes the audit policy: a tap audits the reader's device id and name. */
const isText = (value: unknown, maxLength: number): value is string =>
  printable(value, maxLength) && value.trim().length > 0;

function deviceIdOf(value: unknown): string {
  if (!isText(value, PLUGIN_READER_LIMITS.deviceIdMaxLength)) {
    throw invalid(
      `deviceId must be 1 to ${PLUGIN_READER_LIMITS.deviceIdMaxLength} characters without control characters`,
    );
  }
  return value;
}

function nameOf(value: unknown): string {
  if (!isText(value, PLUGIN_READER_LIMITS.nameMaxLength)) {
    throw invalid(`name must be 1 to ${PLUGIN_READER_LIMITS.nameMaxLength} characters without control characters`);
  }
  return value;
}

function listOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    new Set(value).size !== value.length ||
    !value.every((entry) => allowed.includes(entry))
  ) {
    throw invalid(`capabilities.${field} must be a non-empty list of distinct values out of: ${allowed.join(', ')}`);
  }
  return [...value];
}

/** A copy without unknown fields, so nothing but the capabilities is stored. */
function capabilitiesOf(value: unknown): PluginReaderCapabilities {
  if (typeof value !== 'object' || value === null) throw invalid('capabilities must be an object');
  const { resourceTypes, actions } = value as Record<string, unknown>;
  return {
    resourceTypes: listOf(resourceTypes, 'resourceTypes', PLUGIN_READER_RESOURCE_TYPES),
    actions: listOf(actions, 'actions', PLUGIN_READER_ACTIONS),
  };
}

function changesOf(value: unknown): PluginReaderChanges {
  if (typeof value !== 'object' || value === null) throw invalid('update must be an object');
  const { name, capabilities } = value as Record<string, unknown>;
  return {
    ...(name === undefined ? {} : { name: nameOf(name) }),
    ...(capabilities === undefined ? {} : { capabilities: capabilitiesOf(capabilities) }),
  };
}

/** Plugin errors pass; a host failure (database, not yet bootstrapped) rejects with a generic error. */
async function hostCall<T>(pluginId: string, call: string, work: () => Promise<T>): Promise<T> {
  if (isPluginRemoved(pluginId)) throw new Error(`readers.${call}: ${REMOVED_PLUGIN_MESSAGE}`);
  try {
    return await work();
  } catch (error) {
    if (error instanceof PluginReaderError) throw error;
    // Its error may carry queries or user data: it stays here.
    logger.warn(`readers.${call} for plugin ${pluginId} failed in the host: ${(error as Error)?.message}`);
    // eslint-disable-next-line preserve-caught-error -- the cause must not reach plugin code
    throw new Error(`readers.${call} failed in the host; try again later`);
  }
}

/**
 * `context.readers` for one plugin. The service is resolved per call, because it is only available once the host
 * finished bootstrapping. Every call acts on the calling plugin's readers only.
 */
export function createPluginReadersContext(
  pluginId: string,
  resolveService: () => PluginReadersService,
): PluginReadersContext {
  return {
    async register(input) {
      if (typeof input !== 'object' || input === null) throw invalid('register needs a reader');
      const deviceId = deviceIdOf(input.deviceId);
      const changes = { name: nameOf(input.name), capabilities: capabilitiesOf(input.capabilities) };
      return hostCall(pluginId, 'register', () => resolveService().register(pluginId, deviceId, changes));
    },
    async update(deviceId, update) {
      const id = deviceIdOf(deviceId);
      const changes = changesOf(update);
      return hostCall(pluginId, 'update', () => resolveService().update(pluginId, id, changes));
    },
    async remove(deviceId) {
      const id = deviceIdOf(deviceId);
      return hostCall(pluginId, 'remove', () => resolveService().remove(pluginId, id));
    },
    async get(deviceId) {
      const id = deviceIdOf(deviceId);
      return hostCall(pluginId, 'get', () => resolveService().get(pluginId, id));
    },
    async list() {
      return hostCall(pluginId, 'list', () => resolveService().list(pluginId));
    },
    async assignResource(deviceId, resourceId) {
      const id = deviceIdOf(deviceId);
      if (!Number.isSafeInteger(resourceId) || resourceId <= 0) throw invalid('resourceId must be a positive integer');
      return hostCall(pluginId, 'assignResource', () => resolveService().assignResource(pluginId, id, resourceId));
    },
    async unassignResource(deviceId) {
      const id = deviceIdOf(deviceId);
      return hostCall(pluginId, 'unassignResource', () => resolveService().unassignResource(pluginId, id));
    },
    async listAssignableResources(capabilities) {
      const checked = capabilitiesOf(capabilities);
      return hostCall(pluginId, 'listAssignableResources', () => resolveService().listAssignableResources(checked));
    },
    async tap(request) {
      const { deviceId, authentication } = (request ?? {}) as Partial<typeof request>;
      if (!isText(deviceId, PLUGIN_READER_LIMITS.deviceIdMaxLength)) {
        throw new TypeError(
          `readers.tap needs a deviceId of 1 to ${PLUGIN_READER_LIMITS.deviceIdMaxLength} characters`,
        );
      }
      if (typeof authentication !== 'string' || authentication.length === 0) {
        throw new TypeError('readers.tap needs the authentication from cards.authenticate');
      }
      // Too long to be a handle: never issued, so it is invalid, and it is not worth a lookup.
      const handle = authentication.length > MAX_AUTHENTICATION_LENGTH ? '' : authentication;
      return hostCall(pluginId, 'tap', () => resolveService().tap(pluginId, deviceId, handle));
    },
  };
}
