import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ReaderUiRegistry } from '../reader-ui/reader-ui.registry';
import type { ReaderUiContributions } from './reader-ui-load';

type ReaderUiRegistryPort = ReaderUiRegistry;

const pending = new Map<string, ReaderUiContributions>();
const pendingFailures: Array<{ pluginName: string; hasAccessHooks: boolean; error: Error }> = [];
let registryRef: ReaderUiRegistryPort | null = null;

/**
 * Plugins load while the module graph is built, before the host registry exists. Contributions
 * and load failures are queued here and handed over by ReaderUiWiring on module init.
 */
export function queueReaderUiContributions(pluginName: string, contributions: ReaderUiContributions): void {
  if (registryRef) registryRef.register(pluginName, contributions);
  else pending.set(pluginName, contributions);
}

export function queueReaderUiLoadFailure(pluginName: string, hasAccessHooks: boolean, error: Error): void {
  if (registryRef) registryRef.reportLoadFailure(pluginName, hasAccessHooks, error);
  else pendingFailures.push({ pluginName, hasAccessHooks, error });
}

export function invalidateReaderUi(pluginName: string, scope: { resourceId?: number; readerId?: number }): void {
  if (!registryRef) throw new Error('Reader UI is not available before the host finished starting');
  registryRef.invalidate(pluginName, scope);
}

export function resetReaderUiWiring(): void {
  pending.clear();
  pendingFailures.length = 0;
  registryRef = null;
}

@Injectable()
export class ReaderUiWiring implements OnModuleInit {
  private readonly logger = new Logger(ReaderUiWiring.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    registryRef = this.moduleRef.get(ReaderUiRegistry, { strict: false });
    for (const [name, contributions] of pending) {
      registryRef.register(name, contributions);
      this.logger.log(`Registered reader UI contributions from plugin ${name}`);
    }
    pending.clear();
    for (const failure of pendingFailures) {
      registryRef.reportLoadFailure(failure.pluginName, failure.hasAccessHooks, failure.error);
    }
    pendingFailures.length = 0;
  }
}
