import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ReaderUiRegistry } from '../reader-ui/reader-ui.registry';
import type { ReaderUiContributions } from './reader-ui-load';

type ReaderUiRegistryPort = ReaderUiRegistry;

/** Every loaded plugin's contributions. Kept for the process: the bootstrap builds (and closes) a throwaway Nest app before the real one. */
const queued = new Map<string, ReaderUiContributions>();
const pendingFailures: Array<{ pluginName: string; hasAccessHooks: boolean; error: Error }> = [];
let registryRef: ReaderUiRegistryPort | null = null;

/**
 * Plugins load while the module graph is built, before the host registry exists. Contributions
 * and load failures are queued here and handed over by ReaderUiWiring on module init. Closing an
 * app only unregisters from its own registry: a context that is created and closed before the
 * real one must not drop the queued contributions.
 */
export function queueReaderUiContributions(pluginName: string, contributions: ReaderUiContributions): void {
  queued.set(pluginName, contributions);
  registryRef?.register(pluginName, contributions);
}

export function queueReaderUiLoadFailure(pluginName: string, hasAccessHooks: boolean, error: Error): void {
  if (registryRef) registryRef.reportLoadFailure(pluginName, hasAccessHooks, error);
  else pendingFailures.push({ pluginName, hasAccessHooks, error });
}

export function invalidateReaderUi(pluginName: string, scope: { resourceId?: number; readerId?: number }): void {
  if (!registryRef) throw new Error('Reader UI is not available before the host finished starting');
  registryRef.invalidate(pluginName, scope);
}

export function unregisterReaderUi(pluginName: string): void {
  registryRef?.unregister(pluginName);
}

export function resetReaderUiWiring(): void {
  queued.clear();
  pendingFailures.length = 0;
  registryRef = null;
}

@Injectable()
export class ReaderUiWiring implements OnModuleInit {
  private readonly logger = new Logger(ReaderUiWiring.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    try {
      registryRef = this.moduleRef.get(ReaderUiRegistry, { strict: false });
    } catch {
      // Hosts without the Attractap/reader UI module (partial test hosts) have nothing to register with.
      this.logger.debug('Reader UI registry is not part of this host');
      return;
    }
    for (const [name, contributions] of queued) {
      registryRef.register(name, contributions);
      this.logger.log(`Registered reader UI contributions from plugin ${name}`);
    }
    for (const failure of pendingFailures) {
      registryRef.reportLoadFailure(failure.pluginName, failure.hasAccessHooks, failure.error);
    }
    pendingFailures.length = 0;
  }
}
