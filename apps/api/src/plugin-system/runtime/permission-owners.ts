import { Logger } from '@nestjs/common';
import { resolveDatabaseBackend } from '../../database/backend';

const logger = new Logger('PluginPermissions');

/**
 * Reads which plugin owns each registered permission key, before AppModule is imported, so plugin load can reject
 * a key another plugin registered in an earlier boot. The backend reads it on a short-lived connection of its own. A
 * missing database or table yields no owners: nothing was registered yet.
 */
export async function loadRecordedPermissionOwners(
  read: () => Promise<Map<string, string | null>> = () => resolveDatabaseBackend().plugins.readPermissionOwners(),
): Promise<Map<string, string | null>> {
  try {
    return await read();
  } catch (error) {
    // Plugin load then cannot see owners from earlier boots; the boot sync still refuses a key another plugin owns
    // (it skips the key and logs an error), so this fails closed.
    logger.error(`Could not read registered plugin permissions: ${(error as Error).message}`);
    return new Map();
  }
}
