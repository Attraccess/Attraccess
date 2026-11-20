/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ModuleRef } from '@nestjs/core';
import type { PluginCardChannel, PluginContext, PluginPermission } from '@attraccess/plugins-backend-sdk';
import { EmulatedCard } from '../../attractap/card-crypto/card-emulator.test-fixture';
import { CardKind } from '../../attractap/card-crypto/card-operations';
import { CardConversationService } from '../../attractap/websockets/card-conversation.service';
import { CardOperationsService } from '../../attractap/websockets/card-operations.service';
import { createRelayReader, createServices, detect } from '../../attractap/websockets/card-relay.test-fixture';
import { LoadedPluginManifest } from '../plugin.manifest';
import { PluginModule } from '../plugin.module';
import { PluginCardAuthentications } from '../readers/plugin-card-authentications';
import { cancelPluginCardConversations } from './plugin-cards-context';

export const PLUGIN_ID = 'plugin-id';

type PluginModuleInternals = {
  createPluginContext(manifest: LoadedPluginManifest): PluginContext;
};

const pluginModuleInternals = () => PluginModule as unknown as PluginModuleInternals;

/**
 * The card stores of the reader tests behind a plugin context built by the real factory. `manifest` comes from
 * the plugin module fixture, so the context is guarded exactly as in production.
 */
export function createPluginCardsHost(
  manifest: (overrides?: Partial<LoadedPluginManifest>) => LoadedPluginManifest,
  permissions: PluginPermission[],
) {
  const services = createServices();
  const authentications = new PluginCardAuthentications();
  const moduleRef = {
    get: jest.fn((token: unknown) => {
      if (token === PluginCardAuthentications) return authentications;
      if (token === CardOperationsService) return services.operations;
      if (token === CardConversationService) return services.conversations;
      throw new Error(`unexpected host token ${String(token)}`);
    }),
  } as unknown as ModuleRef;
  new PluginModule({}, new EventEmitter2(), moduleRef);
  const context = pluginModuleInternals().createPluginContext(manifest({ id: PLUGIN_ID, permissions }));

  /** Enrolls a card through an Attractap reader, as a user would. */
  const enroll = async (kind: CardKind) => {
    const card = new EmulatedCard(kind);
    const reader = createRelayReader(card, services.conversations);
    const result = await services.operations.enroll(reader.socket, detect(), {
      userId: services.user.id,
      auditPrincipal: { userId: services.user.id, authenticationMethod: 'session' },
    });
    expect(result).toEqual({ ok: true });
    return card;
  };

  /** The helper the plugin module's cleanup calls on unload (the hook itself: plugin-ble.integration.spec.ts). */
  const unloadPlugin = (pluginId: string) => cancelPluginCardConversations(moduleRef, pluginId);

  return { ...services, context, enroll, unloadPlugin, authentications };
}

/** A plugin device that hands every APDU straight to the card. */
export const cardChannel = (card: EmulatedCard): PluginCardChannel & { apdus: Uint8Array[] } => {
  const apdus: Uint8Array[] = [];
  return {
    apdus,
    exchange: async (apdu) => {
      apdus.push(apdu);
      return new Uint8Array(card.transceive(Buffer.from(apdu)));
    },
  };
};

/** A device that never answers; it records the signals the host handed it. */
export const silentChannel = () => {
  const signals: AbortSignal[] = [];
  const channel: PluginCardChannel = {
    exchange: (_apdu, { signal }) => {
      signals.push(signal);
      return new Promise<Uint8Array>(() => undefined);
    },
  };
  return { channel, signals };
};

/** Every property name and value of the result, nested ones included. */
export const deepEntries = (value: any, path = ''): Array<[string, unknown]> =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, inner]) => [
        [`${path}${key}`, inner] as [string, unknown],
        ...deepEntries(inner, `${path}${key}.`),
      ])
    : [];
