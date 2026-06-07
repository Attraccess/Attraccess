// RabbitMQ management plugin — backend half (scaffold).
//
// This is the foundation bootstrap (ATT-526): it proves the nx build/zip/publish
// pipeline produces a loadable plugin. It deliberately contains NO RabbitMQ
// business logic yet — that lands in ATT-521+. For now it registers a minimal
// module with a single status endpoint so the artifact is a valid, loadable
// plugin end to end.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { Controller, DynamicModule, Get, Inject, Injectable, OnModuleInit } from '@nestjs/common';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry, so this is
// the exact same symbol the host registers.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

@Injectable()
class RabbitmqService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  onModuleInit(): void {
    this.context.logger.log('RabbitMQ plugin loaded (scaffold — no management logic yet).');
  }

  getStatus(): { plugin: string; status: string } {
    return { plugin: 'rabbitmq', status: 'ok' };
  }
}

// Mounts `GET /rabbitmq/status` into the host API. Same access level as the
// host MQTT servers controller.
@Auth('canManageResources')
@Controller('rabbitmq')
class RabbitmqController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(@Inject(RabbitmqService) private readonly service: RabbitmqService) {}

  @Get('status')
  status(): { plugin: string; status: string } {
    return this.service.getStatus();
  }
}

class RabbitmqPluginModule {}

const plugin: PluginBackendModule = {
  register(context: PluginContext): DynamicModule {
    return {
      module: RabbitmqPluginModule,
      controllers: [RabbitmqController],
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, RabbitmqService],
    };
  },
};

export default plugin;
