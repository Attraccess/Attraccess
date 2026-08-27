// Hello World example backend plugin.
//
// Demonstrates the three core backend capabilities a real plugin needs:
//   1. A NestJS controller that adds a REST endpoint to the host API.
//   2. A service that reads from the host database through an injected repository.
//   3. A handler subscribed to a typed host SystemEvent.
//
// It is built in isolation (own bundler, own node_modules resolution) exactly
// like a third-party plugin would be — see ../build.mjs and ../README.md.
import type { PluginBackendModule, PluginContext, SystemEvent } from '@attraccess/plugins-backend-sdk';
import { Controller, DynamicModule, Get, Inject, Injectable, OnModuleInit } from '@nestjs/common';

/**
 * The injection token the host uses to hand each plugin its PluginContext.
 * Recreated locally (NOT imported as a runtime value) so the built artifact has
 * zero runtime dependency on the SDK package: `Symbol.for()` resolves against the
 * process-global registry, so this is the exact same symbol the host registers.
 */
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/**
 * Typed host SystemEvent this plugin subscribes to. `SystemEvent` is imported as
 * a TYPE only (erased at build time); the enum value is supplied as a string
 * literal cast so the artifact keeps zero runtime dependency on the SDK.
 * Subscribing requires the `LISTEN_EVENTS` permission declared in plugin.json.
 */
const RESOURCE_USAGE_STARTED = 'RESOURCE_USAGE_STARTED' as SystemEvent;

/** Minimal shape of the host `User` row we read — declared locally, no import. */
interface UserRow {
  id: number;
  username: string;
}

@Injectable()
class HelloWorldService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  // Subscribe to a typed host event once the plugin's module is initialised.
  // Handler errors are isolated by the host and never break the core flow.
  onModuleInit(): void {
    this.context.onEvent(RESOURCE_USAGE_STARTED, ({ resource, user }) => {
      this.context.logger.log(`Resource ${resource.id} usage started by user ${user.id} — hello!`);
      void this.context.flows.trigger(
        'plugin.hello-world.usage-started',
        (config) => config.userId === user.id,
        { resource: { id: resource.id }, user: { id: user.id, username: user.username } },
      );
    });
  }

  // Read from the host DB through an injected repository. We address the entity
  // by NAME ('User') rather than importing the class, which keeps the artifact
  // dependency-free; the host resolves the name to its own User entity and gates
  // the call behind the READ_USERS permission.
  async greetUsers(): Promise<string[]> {
    const users = this.context.getRepository<UserRow>('User');
    const rows = await users.find({ take: 5 });
    return rows.map((row) => `Hello, ${row.username}!`);
  }
}

// A controller is mounted into the host's router, so this adds
// `GET /hello-world/greetings` to the Attraccess API.
@Controller('hello-world')
class HelloWorldController {
  // Inject by an EXPLICIT token. esbuild (used by build.mjs) does not emit
  // `emitDecoratorMetadata`, so Nest cannot infer constructor types for
  // injection — without `@Inject(...)` the dependency resolves to undefined at
  // runtime. Real plugins built with esbuild must always inject by explicit token.
  constructor(@Inject(HelloWorldService) private readonly service: HelloWorldService) {}

  @Get('greetings')
  async greetings(): Promise<{ greetings: string[] }> {
    return { greetings: await this.service.greetUsers() };
  }
}

// The host imports the DynamicModule returned by register() into its DI graph.
class HelloWorldPluginModule {}

const plugin: PluginBackendModule = {
  flowNodes: [
    {
      type: 'plugin.hello-world.usage-started',
      label: 'Hello World usage started',
      description: 'Starts when the configured user starts using a resource.',
      configSchema: {
        type: 'object',
        properties: { userId: { type: 'number', title: 'User ID' } },
        required: ['userId'],
      },
      inputs: [],
      outputs: ['output'],
      isInput: true,
    },
  ],
  register(context: PluginContext): DynamicModule {
    return {
      module: HelloWorldPluginModule,
      controllers: [HelloWorldController],
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, HelloWorldService],
    };
  },
};

export default plugin;
