import type { PluginAuditContext, PluginAuditHostProvider } from '@attraccess/plugins-backend-sdk';

/** Missing foundation or storage failure is explicit; never log the event/error as a fallback. */
export function createPluginAuditContext(
  pluginId: string,
  resolve: () => PluginAuditHostProvider,
): PluginAuditContext {
  return {
    async record(event) {
      try {
        return await resolve().record({ ...event, pluginId });
      } catch {
        return { status: 'unavailable' };
      }
    },
  };
}
