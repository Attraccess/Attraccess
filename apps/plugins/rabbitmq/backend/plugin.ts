// RabbitMQ management plugin — backend half.
//
// ATT-526 bootstrapped this as a loadable, do-nothing artifact. ATT-521 adds the
// first business logic: detect whether a configured MQTT server is a RabbitMQ
// broker by probing its management HTTP API, and expose that verdict to the
// frontend slots. All RabbitMQ knowledge lives here in the plugin — the core
// only hands us a generic MQTT server config through the ACCESS_MQTT_SERVERS
// hook (see RabbitmqDetectionService).
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { Controller, DynamicModule, Get, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RabbitmqDetectionController } from './rabbitmq-detection.controller';
import { RabbitmqDetectionService } from './rabbitmq-detection.service';
import { RabbitmqManagementClient } from './rabbitmq-management-client';
import { RabbitmqUsersController } from './rabbitmq-users.controller';
import { RabbitmqUsersService } from './rabbitmq-users.service';
import { RabbitmqCredentialProvisioningProvider } from './rabbitmq-credential-provisioning.provider';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry, so this is
// the exact same symbol the host registers.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

@Injectable()
class RabbitmqService implements OnModuleInit {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  onModuleInit(): void {
    this.context.logger.log('RabbitMQ plugin loaded — MQTT-server RabbitMQ detection active.');
  }

  getStatus(): { plugin: string; status: string } {
    return { plugin: 'rabbitmq', status: 'ok' };
  }
}

// Mounts `GET /rabbitmq/status` into the host API. Same access level as the
// host MQTT servers controller.
@Auth('resources.update')
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
  credentialProvisioningProvider(context: PluginContext): RabbitmqCredentialProvisioningProvider {
    return new RabbitmqCredentialProvisioningProvider(context);
  },
  register(context: PluginContext): DynamicModule {
    return {
      module: RabbitmqPluginModule,
      controllers: [RabbitmqController, RabbitmqDetectionController, RabbitmqUsersController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        RabbitmqService,
        RabbitmqDetectionService,
        RabbitmqManagementClient,
        RabbitmqUsersService,
      ],
    };
  },
};

export default plugin;
