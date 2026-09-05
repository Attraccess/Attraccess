import type { PluginAuditContext, PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';

/** Missing foundation or storage failure is explicit; never log the event/error as a fallback. */
export function createPluginAuditContext(pluginId: string, resolve: () => PluginAuditHostProvider): PluginAuditContext {
  return {
    async record(event) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          resolve().record({ ...event, pluginId }),
          new Promise<PluginAuditReceipt>((done) => {
            timeout = setTimeout(() => done({ status: 'unavailable' }), 1000);
          }),
        ]);
      } catch {
        return { status: 'unavailable' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
