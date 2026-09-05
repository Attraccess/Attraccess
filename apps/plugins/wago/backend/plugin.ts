import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import { WagoController } from './wago-controller.entity';
import { WagoService } from './wago.service';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { createWagoCommandNode } from './wago-command-node';
import { WagoDiagnosticsController } from './diagnostics.controller';
import { WagoDiagnosticsService } from './diagnostics.service';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
class WagoPluginModule {}

const plugin: PluginBackendModule = {
  entities: [
    WagoController,
    WagoSettings,
    WagoEnrollment,
    WagoConfigurationDraft,
    WagoConfigurationRevision,
    WagoCommissioningSession,
  ],
  flowNodes: (context) => [createWagoCommandNode(context)],
  register(context: PluginContext): DynamicModule {
    return {
      module: WagoPluginModule,
      controllers: [WagoControllerApi, WagoDiagnosticsController],
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, WagoService, WagoCommissioningService, WagoDiagnosticsService],
    };
  },
};
export default plugin;
