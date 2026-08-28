import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import { WagoController } from './wago-controller.entity';
import { WagoService } from './wago.service';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
class WagoPluginModule {}

const plugin: PluginBackendModule = {
  entities: [WagoController, WagoSettings, WagoEnrollment],
  register(context: PluginContext): DynamicModule {
    return {
      module: WagoPluginModule,
      controllers: [WagoControllerApi],
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, WagoService],
    };
  },
};
export default plugin;
