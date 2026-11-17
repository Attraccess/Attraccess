// Standalone example backend plugin built OUTSIDE the api app to prove ATT-454
// real-world dynamic loading: separate package, own bundler, externalized peers.
import type { PluginBackendModule, PluginContext, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { Column, Entity, PrimaryGeneratedColumn, sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import { DynamicModule, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Recreated locally (NOT imported as a runtime value from the SDK root) so the plugin does not depend on the SDK
 * root at runtime. Safe because Symbol.for() resolves against the process-global symbol registry, so this is the
 * exact same symbol the host uses as the PLUGIN_CONTEXT injection token.
 */
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

export const POC_PING_EVENT = 'poc.host.ping';
export const POC_PONG_EVENT = 'poc.plugin.pong';

/**
 * Typed host SystemEvent this plugin subscribes to. SystemEvent is imported as a
 * TYPE only (erased at build time); the enum value is supplied as a string literal
 * cast. Subscribing requires the LISTEN_EVENTS permission in plugin.json.
 */
const RESOURCE_USAGE_STARTED = 'RESOURCE_USAGE_STARTED' as SystemEvent;

/**
 * Payload the plugin emits back to the host. The *InstanceMatch flags are the
 * crux of the PoC: they are true only when the plugin's bundler externalized the
 * peer dependency, so the plugin and host share the exact same class object.
 */
export interface PocPongPayload {
  eventsInstanceMatch: boolean;
  /** True when the host connection resolved this plugin's entity metadata: one TypeORM copy is shared. */
  entityMetadataResolved: boolean;
  savedId: number;
  savedMessage: string;
  hostGreeting: string;
}

/** The plugin's own table. The host registers it from `persistence.sqlite.entities`; the schema is the plugin's. */
@Entity({ name: 'poc_note' })
class PocNote {
  @PrimaryGeneratedColumn()
  id!: number;

  // esbuild does not emit decorator metadata, so the column type is explicit.
  @Column({ type: 'varchar' })
  message!: string;
}

@Injectable()
class PocPluginService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  onModuleInit(): void {
    this.context.events.on(POC_PING_EVENT, (message: string) => void this.handlePing(message));

    // Typed plugin event API: payload is type-checked against the SystemEvent.
    this.context.onEvent(RESOURCE_USAGE_STARTED, (payload) => {
      this.context.logger.log(`Resource ${payload.resource.id} usage started by user ${payload.user.id}`);
    });
  }

  private async handlePing(message: string): Promise<void> {
    const repository = sqlitePersistence(this.context).getRepository(PocNote);
    const saved = await repository.save({ message: `${this.context.manifest.name}:${message}` });
    const host = this.context.get<{ greet(): string }>('POC_HOST_GREETER');

    const payload: PocPongPayload = {
      eventsInstanceMatch: this.context.events instanceof EventEmitter2,
      entityMetadataResolved: repository.metadata.tableName === 'poc_note',
      savedId: Number(saved.id),
      savedMessage: String(saved.message),
      hostGreeting: host.greet(),
    };
    this.context.events.emit(POC_PONG_EVENT, payload);
  }
}

class PocBackendPluginModule {}

const plugin: PluginBackendModule = {
  persistence: { sqlite: { entities: [PocNote] } },
  register(context: PluginContext): DynamicModule {
    return {
      module: PocBackendPluginModule,
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, PocPluginService],
    };
  },
};

export default plugin;
