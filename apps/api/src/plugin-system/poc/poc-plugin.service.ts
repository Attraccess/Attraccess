import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PLUGIN_CONTEXT, PluginContext } from '@attraccess/plugins-backend-sdk';
import { PocNote } from './poc-note.entity';

export const POC_PING_EVENT = 'poc.ping';
export const POC_PONG_EVENT = 'poc.pong';

/**
 * Throwaway example plugin service for ATT-454. Demonstrates that a backend
 * plugin can: inject the PluginContext, subscribe to a host event, write through
 * the host repository it received, and emit an event back to the host.
 */
@Injectable()
export class PocPluginService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  onModuleInit(): void {
    this.context.events.on(POC_PING_EVENT, (message: string) => this.handlePing(message));
  }

  private async handlePing(message: string): Promise<void> {
    const repository = this.context.getRepository(PocNote);
    const saved = await repository.save(repository.create({ message: `${this.context.manifest.name}:${message}` }));
    this.context.events.emit(POC_PONG_EVENT, saved.id);
  }
}
