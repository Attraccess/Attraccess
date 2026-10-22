import type { PluginBackendAdapters } from '@attraccess/plugins-backend-sdk/adapter';
import { WAGO_CONTROLLERS } from './controllers/persistence/port';
import { TypeormWagoControllerPersistence } from './controllers/persistence/typeorm-adapter';
import { WAGO_CONFIGURATION } from './configuration/persistence/port';
import { TypeormWagoConfigurationPersistence } from './configuration/persistence/typeorm-adapter';
import { WAGO_FLOW_READS, WAGO_DIAGNOSTICS } from './flow/persistence/port';
import { TypeormWagoDiagnosticsPersistence } from './flow/persistence/typeorm-adapter';
import { WAGO_CREDENTIALS } from './credentials/persistence/port';
import { WAGO_COMMISSIONING } from './commissioning/persistence/port';
import { TypeormWagoCommissioningPersistence } from './commissioning/persistence/typeorm-adapter';
import { WAGO_MANAGEMENT } from './management/persistence/port';
import { TypeormWagoManagementPersistence } from './management/persistence/typeorm-adapter';
import { WAGO_DEVICE_LEASES } from './runtime/persistence/port';
import { TypeormWagoDeviceOperationPersistence } from './runtime/persistence/typeorm-adapter';
import { WAGO_NETWORK } from './network/persistence/port';
import { TypeormWagoNetworkPersistence } from './network/persistence/typeorm-adapter';
import { WAGO_MANAGED_RUNTIME } from './runtime/managed/persistence/port';
import { TypeormWagoManagedPersistence } from './runtime/managed/persistence/typeorm-adapter';
import { WagoManagedPersistence } from './runtime/managed/persistence/port';
import { WagoNetworkPersistence } from './network/persistence/port';
import { WagoDeviceOperations } from './runtime/device-operations';
import { WagoCommissioningPersistence } from './commissioning/persistence/port';
import { PersistentManagementStore } from './management/store';
import { WagoDiagnosticsPersistence } from './flow/persistence/port';
import { WagoControllerPersistence } from './controllers/persistence/port';
import { WagoConfigurationPersistence } from './configuration/persistence/port';
import { WagoFlowPersistence } from './flow/persistence/port';
import { TypeormWagoFlowPersistence } from './flow/persistence/typeorm-adapter';
import { WagoCredentialPersistence } from './credentials/persistence/port';
import { TypeormWagoCredentialPersistence } from './credentials/persistence/typeorm-adapter';
import type {
  PluginBackendModule,
  PluginContext,
  Resource,
  ResourceFlowNode,
} from '@attraccess/plugins-backend-sdk/v2';
import { DynamicModule } from '@nestjs/common';
import { WagoControllerApi } from './controllers/controller';
import { WagoController } from './controllers/entity';
import { WagoService } from './controllers/service';
import { WagoSettings } from './controllers/settings.entity';
import { WagoEnrollment } from './controllers/enrollment.entity';
import { WagoConfigurationDraft } from './configuration/draft.entity';
import { WagoConfigurationRevision } from './configuration/revision.entity';
import { WagoCredentialRotationEntity } from './credentials/persistence/schema';
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

const plugin: PluginBackendModule & PluginBackendAdapters = {
  persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
  persistenceAdapters: [
    {
      backend: 'sqlite',
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
      operations: [
        {
          token: WAGO_CONTROLLERS,
          create: ({ manager }) =>
            new TypeormWagoControllerPersistence(
              () => manager.getRepository(WagoController),
              () => manager.getRepository(WagoEnrollment),
              () => manager.getRepository(WagoSettings),
            ),
        },
        {
          token: WAGO_CONFIGURATION,
          create: ({ manager }) =>
            new TypeormWagoConfigurationPersistence(
              () => manager.getRepository(WagoConfigurationDraft),
              () => manager.getRepository(WagoConfigurationRevision),
              () => manager.getRepository<ResourceFlowNode>('ResourceFlowNode'),
            ),
        },
        {
          token: WAGO_FLOW_READS,
          create: ({ manager }) =>
            new TypeormWagoFlowPersistence(
              () => manager.getRepository(WagoController),
              () => manager.getRepository(WagoConfigurationRevision),
              () => manager.getRepository(WagoSettings),
            ),
        },
        {
          token: WAGO_DIAGNOSTICS,
          create: ({ manager }) =>
            new TypeormWagoDiagnosticsPersistence(
              () => manager.getRepository(WagoController),
              () => manager.getRepository(WagoConfigurationDraft),
              () => manager.getRepository(WagoConfigurationRevision),
              () => manager.getRepository<ResourceFlowNode>('ResourceFlowNode'),
              () => manager.getRepository<Resource>('Resource'),
              () => manager.getRepository(WagoCommissioningSession),
            ),
        },
        {
          token: WAGO_CREDENTIALS,
          create: ({ manager }) =>
            new TypeormWagoCredentialPersistence(
              () => manager.getRepository(WagoController),
              () => manager.getRepository(WagoCredentialRotationEntity),
            ),
        },
        {
          token: WAGO_COMMISSIONING,
          create: ({ manager }) =>
            new TypeormWagoCommissioningPersistence(
              () => manager.getRepository(WagoCommissioningSession),
              () => manager.getRepository(WagoController),
              () => manager.getRepository(WagoEnrollment),
              () => manager.getRepository(WagoConfigurationRevision),
            ),
        },
        {
          token: WAGO_MANAGEMENT,
          create: ({ manager }) =>
            new TypeormWagoManagementPersistence(() => manager.getRepository(WagoManagementEntity)),
        },
        {
          token: WAGO_DEVICE_LEASES,
          create: ({ manager }) =>
            new TypeormWagoDeviceOperationPersistence(() => manager.getRepository(WagoDeviceOperation)),
        },
        { token: WAGO_NETWORK, create: ({ manager }) => new TypeormWagoNetworkPersistence(() => manager) },
        { token: WAGO_MANAGED_RUNTIME, create: ({ manager }) => new TypeormWagoManagedPersistence(() => manager) },
      ],
    },
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
        { provide: WagoControllerPersistence, useFactory: () => context.persistence.resolve(WAGO_CONTROLLERS) },
        { provide: WagoConfigurationPersistence, useFactory: () => context.persistence.resolve(WAGO_CONFIGURATION) },
        WagoService,
        { provide: WagoFlowPersistence, useFactory: () => context.persistence.resolve(WAGO_FLOW_READS) },
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
        { provide: WagoDiagnosticsPersistence, useFactory: () => context.persistence.resolve(WAGO_DIAGNOSTICS) },
        WagoDiagnosticsService,
        {
          provide: WagoDeviceOperations,
          useFactory: () => new WagoDeviceOperations(context.persistence.resolve(WAGO_DEVICE_LEASES)),
        },
        { provide: WagoManagedPersistence, useFactory: () => context.persistence.resolve(WAGO_MANAGED_RUNTIME) },
        WagoManagedRuntimeService,
        {
          provide: PersistentManagementStore,
          useFactory: () => new PersistentManagementStore(context.persistence.resolve(WAGO_MANAGEMENT)),
        },
        { provide: WagoCommissioningPersistence, useFactory: () => context.persistence.resolve(WAGO_COMMISSIONING) },
        WagoCommissioningService,
        { provide: WagoCredentialPersistence, useFactory: () => context.persistence.resolve(WAGO_CREDENTIALS) },
        WagoCredentialRotationService,
        { provide: WagoNetworkPersistence, useFactory: () => context.persistence.resolve(WAGO_NETWORK) },
        WagoNetworkChangeService,
        WagoLiveUpdatesService,
      ],
    };
  },
};
export default plugin;
