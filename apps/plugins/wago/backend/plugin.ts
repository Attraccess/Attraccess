import type { PluginBackendModule, PluginContext, PluginFlowNodeDefinition } from '@attraccess/plugins-backend-sdk';
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
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoArtifactsController, WagoArtifactUploadInterceptor } from './wago-artifacts.controller';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { WagoManagementEntity } from './wago-management.entity';
import { WagoCommissioningLeaseEntity } from './wago-commissioning-lease.entity';
import { createWagoCommandNode } from './wago-command-node';
import { WagoFlowService } from './wago-flow.service';
import { WagoDiagnosticsController } from './diagnostics.controller';
import { WagoDiagnosticsService } from './diagnostics.service';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
class WagoPluginModule {}
let flowService: WagoFlowService;

const plugin: PluginBackendModule = {
  entities: [
    WagoController,
    WagoSettings,
    WagoEnrollment,
    WagoConfigurationDraft,
    WagoConfigurationRevision,
    WagoCommissioningSession,
    WagoManagementEntity,
    WagoCommissioningLeaseEntity,
  ],
  flowNodes: (context): PluginFlowNodeDefinition[] => [
    createWagoCommandNode(context),
    {
      type: 'plugin.wago.event-received',
      label: 'WAGO event received',
      description: 'Starts when a WAGO Logical Channel reports an event.',
      inputs: [],
      outputs: ['output'],
      isInput: true,
      resolveConfigSchema: (config) => flowService.resolveConfigSchema(config, 'event'),
    },
    {
      type: 'plugin.wago.read-state',
      label: 'WAGO read state',
      description: 'Reads the latest WAGO Logical Channel state.',
      inputs: ['input'],
      outputs: ['output'],
      resolveConfigSchema: (config) => flowService.resolveConfigSchema(config, 'read'),
      execute: async (node, input) => {
        const state = flowService.read(node.data);
        return state
          ? { payload: { ...input, wago: flowService.payload(state) } }
          : { payload: { ...input, wago: { status: 'unavailable' } } };
      },
    },
    {
      type: 'plugin.wago.wait-for-state',
      label: 'WAGO wait for state',
      description: 'Waits for a WAGO Logical Channel state.',
      inputs: ['input'],
      outputs: ['output', 'failure'],
      resolveConfigSchema: (config) => flowService.resolveConfigSchema(config, 'wait'),
      execute: async (node, input) => {
        const state = await flowService.wait(node.data);
        return state
          ? { payload: { ...input, wago: flowService.payload(state) } }
          : { payload: input, outputHandle: 'failure' };
      },
    },
  ],
  register(context: PluginContext): DynamicModule {
    flowService = new WagoFlowService(context);
    return {
      module: WagoPluginModule,
      controllers: [WagoControllerApi, WagoDiagnosticsController, WagoArtifactsController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        WagoService,
        WagoDiagnosticsService,
        WagoCommissioningService,
        WagoRuntimeArtifactsService,
        WagoArtifactUploadInterceptor,
        WagoCommissioningReadiness,
        { provide: WagoFlowService, useValue: flowService },
      ],
    };
  },
};
export default plugin;
