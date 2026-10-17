// Hello World example backend plugin.
//
// Demonstrates the three core backend capabilities a real plugin needs:
//   1. A NestJS controller that adds a REST endpoint to the host API.
//   2. A service that reads user names through permission-checked host operations.
//   3. A handler subscribed to a typed host SystemEvent.
//
// It is built in isolation (own bundler, own node_modules resolution) exactly
// like a third-party plugin would be — see ../build.mjs and ../README.md.
import { PLUGIN_CONTEXT, SystemEvent } from '@attraccess/plugins-backend-sdk/v2';
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk/v2';
import { Controller, DynamicModule, Get, Inject, Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
class HelloWorldService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  // Subscribe to a typed host event once the plugin's module is initialised.
  // Handler errors are isolated by the host and never break the core flow.
  async onModuleInit(): Promise<void> {
    this.context.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, ({ resource, user }) => {
      this.context.logger.log(`Resource ${resource.id} usage started by user ${user.id} — hello!`);
      return this.context.flows.trigger(
        'plugin.plugin-hello-world.usage-started',
        (config) => config.userId === user.id,
        { resource: { id: resource.id }, user: { id: user.id, username: user.username } },
      );
    });

    await this.context.mqtt.subscribe(1, 'hello-world/ping', ({ payload }) => {
      this.context.logger.log(`Received MQTT greeting: ${payload.toString()}`);
    });
    await this.context.mqtt.publish(1, 'hello-world/ping', 'Hello from the plugin!');
  }

  // The host returns only user IDs and names, after checking READ_USERS.
  // No entity class, repository, connection or query expression crosses this boundary.
  async greetUsers(): Promise<string[]> {
    const rows = await this.context.operations.users.list({ limit: 5 });
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
  persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
  flowNodes: [
    {
      type: 'plugin.plugin-hello-world.usage-started',
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
