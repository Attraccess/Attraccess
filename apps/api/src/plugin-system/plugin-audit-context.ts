import type { PluginAuditContext, PluginAuditHostProvider } from '@attraccess/plugins-backend-sdk';

export const PLUGIN_AUDIT_TIMEOUT_MS = 5_000;

/** Missing foundation or storage failure is explicit; never log the event/error as a fallback. */
export function createPluginAuditContext(
  pluginId: string,
  resolve: () => PluginAuditHostProvider,
): PluginAuditContext {
  return {
    async record(event) {
      try {
        return await withTimeout(resolve().record({ ...event, pluginId }));
      } catch {
        return { status: 'unavailable' };
      }
    },
  };
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Plugin audit storage timed out')), PLUGIN_AUDIT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
