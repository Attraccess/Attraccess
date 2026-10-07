import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { NpmPluginActivationImplementation } from './npm-plugin-activation';
import { PendingNpmPluginAudit } from './npm-plugin-audit-state';
import {
  InstalledNpmPlugin,
  PluginFileMove,
  STATE_FILE,
  TRANSACTION_FILE,
  readInstalledNpmPlugins,
} from './npm-plugin.service.feature-definitions';
import { PluginService } from './plugin.service';
export abstract class NpmPluginStatePersistenceImplementation extends NpmPluginActivationImplementation {
  protected async writeState(
    installed: InstalledNpmPlugin,
    pendingAudit?: PendingNpmPluginAudit | null,
  ): Promise<void> {
    const previous = readInstalledNpmPlugins();
    const records = previous.filter(({ name }) => name !== installed.name);
    const pending =
      pendingAudit === undefined
        ? previous.find((plugin) => plugin.name === installed.name)?.pendingAudit
        : pendingAudit;
    const stored = { ...installed, ...(pending ? { pendingAudit: pending } : {}) };
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify([...records, stored]));
      await rename(temporaryPath, statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  protected async writeTransaction(
    records: ReturnType<typeof readInstalledNpmPlugins>,
    moves: PluginFileMove[],
  ): Promise<void> {
    const journalPath = join(PluginService.PLUGIN_PATH, TRANSACTION_FILE);
    // Refuse to overwrite an unfinished transaction, including cleanup failures.
    if (existsSync(journalPath))
      throw new BadRequestException('An unfinished plugin transaction must be recovered by restarting first.');
    const temporaryPath = `${journalPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify({ after: JSON.stringify(records), moves }), { flag: 'wx' });
      await rename(temporaryPath, journalPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  protected async writeRecords(records: ReturnType<typeof readInstalledNpmPlugins>): Promise<void> {
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(records));
      await rename(temporaryPath, statePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  protected async mutateInstalls<T>(operation: () => Promise<T>): Promise<T> {
    const mutation = this.installMutation.then(async () => {
      // Recovery compares the state with the journal's commit point. Any later
      // state change could make a committed tree look like an interrupted one.
      if (existsSync(join(PluginService.PLUGIN_PATH, TRANSACTION_FILE)))
        throw new BadRequestException('An unfinished plugin transaction must be recovered by restarting first.');
      return operation();
    });
    this.installMutation = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }
}
