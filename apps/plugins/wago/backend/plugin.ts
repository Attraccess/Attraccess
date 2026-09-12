import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import { WagoController } from './wago-controller.entity';
import { WagoService } from './wago.service';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoCredentialRotationService } from './wago-credential-rotation';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoArtifactsController, WagoArtifactUploadInterceptor } from './wago-artifacts.controller';
import { WagoDiagnosticsController } from './diagnostics.controller';
import { WagoDiagnosticsService } from './diagnostics.service';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { WagoManagementEntity } from './wago-management.entity';
import { WagoCommissioningLeaseEntity } from './wago-commissioning-lease.entity';
import { createWagoCommandNode } from './wago-command-node';
import { WagoFlowService } from './wago-flow.service';
import { createWagoStateNodes } from './wago-state-nodes';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
class WagoPluginModule {}

// Flow definitions are registered before Nest constructs the plugin services.
// Bind to the same instances used by the controllers, without resolving host providers.
const flowServices = new WeakMap<PluginContext, { command: WagoService; state: WagoFlowService }>();
function services(context: PluginContext) {
  const result = flowServices.get(context);
  if (!result) throw new Error('WAGO flow services are not initialized.');
  return result;
}

const plugin: PluginBackendModule = {
  entities: [
    WagoController,
    WagoSettings,
    WagoEnrollment,
    WagoConfigurationDraft,
    WagoConfigurationRevision,
    WagoCredentialRotationEntity,
    WagoCommissioningSession,
    WagoManagementEntity,
    WagoCommissioningLeaseEntity,
  ],
  flowNodes: (context) => [
    createWagoCommandNode(() => services(context).command),
    ...createWagoStateNodes(() => services(context).state),
  ],
  register(context: PluginContext): DynamicModule {
    return {
      module: WagoPluginModule,
      controllers: [WagoControllerApi, WagoArtifactsController, WagoDiagnosticsController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        WagoService,
        WagoFlowService,
        {
          provide: 'wago-flow-services',
          inject: [WagoService, WagoFlowService],
          useFactory: (command: WagoService, state: WagoFlowService) => {
            const bound = { command, state };
            flowServices.set(context, bound);
            return {
              onModuleDestroy: () => {
                if (flowServices.get(context) === bound) flowServices.delete(context);
              },
            };
          },
        },
        WagoRuntimeArtifactsService,
        WagoArtifactUploadInterceptor,
        WagoCommissioningReadiness,
        WagoDiagnosticsService,
        WagoCommissioningService,
        WagoCredentialRotationService,
      ],
    };
  },
};
export default plugin;
