import {
  PluginBleError,
  toBleError,
  type PluginBleContext,
  type PluginBleSession,
} from '@attraccess/plugins-backend-sdk';
import type { LoggerService } from '@nestjs/common';
import { registerPluginBleProfile } from './plugin-ble-profile-registry';
import type { PluginBleCaller, PluginBleService } from './plugin-ble.service';

/**
 * `context.ble` for one plugin. `registerProfile` is synchronous and needs no host singleton, so it works from
 * plugin constructors and module scope in any load order. Every other method is async, resolves the service per
 * call and rejects (never throws synchronously, never waits) with a retryable `NOT_READY` before the host
 * finished bootstrapping.
 */
export function createPluginBleContext(
  plugin: { id: string; logger: LoggerService },
  resolveService: () => PluginBleService,
): PluginBleContext {
  const caller: PluginBleCaller = { pluginId: plugin.id, logger: plugin.logger };

  const call = async <T>(operation: string, fn: (service: PluginBleService) => Promise<T>): Promise<T> => {
    let service: PluginBleService;
    try {
      service = resolveService();
    } catch {
      throw new PluginBleError('NOT_READY', 'The host is not ready yet; retry after bootstrap completed', {
        operation,
        detail: 'bootstrap',
      });
    }
    try {
      return await fn(service);
    } catch (error) {
      throw toBleError(error, operation);
    }
  };

  const openSession: PluginBleContext['openSession'] = (endpointId, options) =>
    call('openSession', (service) => service.openSession(caller, endpointId, options));

  return {
    registerProfile: (definition) => registerPluginBleProfile(plugin.id, definition),
    listReaders: () => call('listReaders', (service) => service.listReaders()),
    scan: (readerId, profileId, options) =>
      call('scan', (service) => service.scan(caller, readerId, profileId, options)),
    createEndpoint: (input) => call('createEndpoint', (service) => service.createEndpoint(caller, input)),
    getEndpoint: (id) => call('getEndpoint', (service) => service.getEndpoint(caller, id)),
    listEndpoints: () => call('listEndpoints', (service) => service.listEndpoints(caller)),
    updateEndpoint: (id, update) => call('updateEndpoint', (service) => service.updateEndpoint(caller, id, update)),
    deleteEndpoint: (id) => call('deleteEndpoint', (service) => service.deleteEndpoint(caller, id)),
    openSession,
    async withSession<T>(
      endpointId: string,
      fn: (session: PluginBleSession) => Promise<T>,
      options?: Parameters<PluginBleContext['openSession']>[1],
    ): Promise<T> {
      const session = await openSession(endpointId, options);
      try {
        return await fn(session);
      } finally {
        await session.close();
      }
    },
  };
}
