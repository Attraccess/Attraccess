import { PluginPermission, type PluginCardsContext, type PluginReadersContext } from '@attraccess/plugins-backend-sdk';
import { CardOperationsService } from '../../attractap/websockets/card-operations.service';
import { createPluginCardsContext } from '../cards/plugin-cards-context';
import type { PluginHostRefs } from '../runtime/host-contexts';
import { PluginCardAuthentications } from './plugin-card-authentications';
import { createPluginReadersContext } from './plugin-readers-context';
import { PluginReadersService } from './plugin-readers.service';

/** Host providers of plugin readers; the plugin module provides them with plugins on and off (uninstall needs them). */
export const READER_PROVIDERS = [PluginCardAuthentications, PluginReadersService];

/** `context.cards` of one plugin. Only a plugin that can tap (READER_DEVICES) gets authentications to tap with. */
export function createHostCardsContext(
  plugin: { id: string; permissions?: PluginPermission[] },
  host: PluginHostRefs,
): PluginCardsContext {
  return createPluginCardsContext(
    plugin.id,
    () => host.get(CardOperationsService),
    (plugin.permissions ?? []).includes(PluginPermission.READER_DEVICES)
      ? () => host.get(PluginCardAuthentications)
      : undefined,
  );
}

/** `context.readers` of one plugin. */
export function createHostReadersContext(pluginId: string, host: PluginHostRefs): PluginReadersContext {
  return createPluginReadersContext(pluginId, () => host.get(PluginReadersService));
}
