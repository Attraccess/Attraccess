import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { WagoControllerApi } from './controllers/controller';
import { WagoController } from './controllers/entity';
import { WagoService } from './controllers/service';
import { WagoSettings } from './controllers/settings.entity';
import { WagoEnrollment } from './controllers/enrollment.entity';
import { WagoConfigurationDraft } from './configuration/draft.entity';
import { WagoConfigurationRevision } from './configuration/revision.entity';
import { WagoCredentialRotationEntity } from './credentials/service';
import { WagoCommissioningSession } from './commissioning/sessions/session.entity';
import { WagoCommissioningService } from './commissioning/service';
import { WagoCredentialRotationService } from './credentials/service';
import { WagoRuntimeArtifactsService } from './runtime/artifacts/catalog';
import { WagoArtifactsController } from './runtime/artifacts/controller';
import { WagoDiagnosticsController } from './diagnostics/service';
import { WagoDiagnosticsService } from './diagnostics/service';
import { WagoCommissioningReadiness } from './commissioning/readiness/readiness';
import { WagoManagementEntity } from './management/entity';
import { createWagoCommandNode } from './flow/command-node';
import { WagoFlowService } from './flow/service';
import { createWagoStateNodes } from './flow/state-nodes';
import { WAGO_AUDIT_DOMAIN } from './audit/policy';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './runtime/managed/access.entity';
import { WagoManagedRuntimeService } from './runtime/managed/service';
import { WagoUpdatesController } from './runtime/update/controller';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from './network/entity';
import { WagoNetworkChangeService } from './network/service';
import { WagoLiveUpdatesService } from './wago-live-updates.service';

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
    WagoManagedAccess,
    WagoRuntimeUpdateEntity,
    WagoDeviceOperation,
    WagoNetworkChange,
    WagoMqttCredentialRetirement,
  ],
  flowNodes: (context) => [
    createWagoCommandNode(() => services(context).command),
    ...createWagoStateNodes(() => services(context).state),
  ],
  auditDomains: [WAGO_AUDIT_DOMAIN],
  register(context: PluginContext): DynamicModule {
    return {
      module: WagoPluginModule,
      controllers: [WagoControllerApi, WagoArtifactsController, WagoDiagnosticsController, WagoUpdatesController],
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
        WagoCommissioningReadiness,
        WagoDiagnosticsService,
        WagoManagedRuntimeService,
        WagoCommissioningService,
        WagoCredentialRotationService,
        WagoNetworkChangeService,
        WagoLiveUpdatesService,
      ],
    };
  },
};
export default plugin;
