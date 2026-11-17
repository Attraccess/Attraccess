import type { PluginCardsContext } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { CardConversationService } from '../../attractap/websockets/card-conversation.service';
import type { CardOperationsService } from '../../attractap/websockets/card-operations.service';

/** Longest plugin device id the host keeps as a conversation key. */
const MAX_DEVICE_LENGTH = 200;

const logger = new Logger('PluginModule');

/**
 * `context.cards` for one plugin. The card service is resolved per call, because it lives in the Attractap module
 * and is only available once the host finished bootstrapping. Invalid requests are programming errors and reject;
 * a host failure rejects with a generic error; every card or conversation outcome resolves.
 */
export function createPluginCardsContext(
  pluginId: string,
  resolveOperations: () => CardOperationsService,
): PluginCardsContext {
  return {
    async authenticate(request) {
      const { uid, device, channel, signal } = request ?? ({} as typeof request);
      if (typeof channel?.exchange !== 'function') {
        throw new TypeError('cards.authenticate needs a channel with an exchange function');
      }
      if (typeof device !== 'string' || device.length === 0 || device.length > MAX_DEVICE_LENGTH) {
        throw new TypeError(`cards.authenticate needs a device id of 1 to ${MAX_DEVICE_LENGTH} characters`);
      }
      if (signal !== undefined && !(signal instanceof AbortSignal)) {
        throw new TypeError('cards.authenticate needs signal to be an AbortSignal');
      }
      try {
        return await resolveOperations().verifyPluginCard({
          pluginId,
          device,
          uid,
          exchange: (apdu, options) => channel.exchange(apdu, options),
          signal,
        });
      } catch (error) {
        // A host failure (database, not yet bootstrapped). Its error may carry queries or card data: it stays here.
        logger.warn(`Card authentication for plugin ${pluginId} failed in the host: ${(error as Error)?.message}`);
        // eslint-disable-next-line preserve-caught-error -- the cause must not reach plugin code
        throw new Error('Card authentication failed in the host; try again later');
      }
    },
  };
}

/**
 * The plugin module is destroyed (disable, uninstall, restart, shutdown): its card conversations end with CANCELLED.
 * A plugin that never got host refs has none. A failure is logged, never blocking the unload.
 */
export function cancelPluginCardConversations(moduleRef: ModuleRef | null, pluginId: string): void {
  if (!moduleRef) return;
  try {
    moduleRef.get(CardConversationService, { strict: false }).cancelPlugin(pluginId);
  } catch (error) {
    logger.warn(`Cancelling card conversations of plugin ${pluginId} failed: ${(error as Error).message}`);
  }
}
