import { PluginBackendModule } from '@attraccess/plugins-backend-sdk';
import { DynamicModule, Type } from '@nestjs/common';
import { join } from 'path';
import { MqttCredentialProvisioningService } from '../mqtt/mqtt-credential-provisioning.service';
import { MqttModule } from '../mqtt/mqtt.module';
import { SettingsModule } from '../settings/settings.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerPluginAuditDomains } from './plugin-audit-registry';
import { PluginClassificationService } from './plugin-classification.service';
import { pluginActivationPlan } from './plugin-dependencies';
import { PluginEventsService } from './plugin-events.service';
import { registerPluginFlowNodes } from './plugin-flow-node-registry';
import { loadPluginEntryExports } from './plugin-loader';
import { PluginMqttService } from './plugin-mqtt.service';
import { PluginSandboxService } from './plugin-sandbox.service';
import { PluginController } from './plugin.controller';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginModule } from './plugin.module';
import { PluginHostContextImplementation } from './plugin-host-context';
import { PluginService } from './plugin.service';

function getImplementationClass(): typeof PluginModule {
  return require('./plugin.module').PluginModule;
}

export abstract class PluginModuleLoadingImplementation extends PluginHostContextImplementation {
  public static forRoot(): DynamicModule {
    if (getImplementationClass().DISABLE_PLUGINS_FLAG) {
      getImplementationClass().logger.log('Plugins are disabled');

      return {
        module: PluginModule,
        imports: [SettingsModule, MqttModule, LiveTopicsModule],
        providers: [
          PluginService,
          PluginSandboxService,
          PluginEventsService,
          PluginMqttService,
          NpmPluginService,
          PluginClassificationService,
          PluginLiveUpdatesService,
        ],
        exports: [PluginEventsService],
        controllers: [PluginController],
      };
    }

    this.pluginManifests = PluginService.getPlugins();

    const { ordered, failures } = pluginActivationPlan(this.pluginManifests);
    for (const [name, error] of failures) {
      const manifest = this.pluginManifests.find((plugin) => plugin.name === name);
      PluginService.setPluginLoadError(`${name}@${manifest.version}`, error);
    }
    const pluginModules: DynamicModule[] = [];
    const modulesByName = new Map<string, DynamicModule>();
    const active = new Set<string>();
    for (const manifest of ordered) {
      if (
        PluginService.isPluginQuarantined(manifest) ||
        PluginService.getPluginsWithLoadStatus().find((plugin) => plugin.name === manifest.name)?.status === 'error'
      )
        continue;
      const failedDependency = manifest.dependencies?.find(
        (dependency) => dependency.required && !active.has(dependency.name),
      );
      if (failedDependency) {
        PluginService.setPluginLoadError(
          `${manifest.name}@${manifest.version}`,
          new Error(
            `Required plugin ${failedDependency.name} failed to load; ${manifest.name} is inactive. Repair or retry the dependency.`,
          ),
        );
        continue;
      }
      try {
        const module = getImplementationClass().loadPluginModule(manifest);
        PluginService.markPluginAsLoaded(`${manifest.name}@${manifest.version}`);
        active.add(manifest.name);
        if (module) {
          const requiredModules = (manifest.dependencies ?? [])
            .filter((dependency) => dependency.required)
            .map((dependency) => modulesByName.get(dependency.name))
            .filter((module) => Boolean(module));
          // Nest also needs these edges so dependency lifecycle hooks run first.
          const configured = requiredModules.length
            ? {
                ...(typeof module === 'function' ? { module: module as Type<unknown> } : module),
                imports: [...(module.imports ?? []), ...requiredModules],
              }
            : module;
          modulesByName.set(manifest.name, configured);
          pluginModules.push(configured);
        }
      } catch (error) {
        this.logger.error(`Error loading plugin ${manifest.name}`, error);
        PluginService.quarantinePlugin(manifest, error as Error);
      }
    }

    return {
      module: PluginModule,
      imports: [SettingsModule, MqttModule, LiveTopicsModule, ...pluginModules],
      providers: [
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
        PluginLiveUpdatesService,
      ],
      exports: [PluginEventsService],
      controllers: [PluginController],
    };
  }

  protected static loadPluginModule(manifest: LoadedPluginManifest): DynamicModule {
    if (!manifest.main.backend?.directory || !manifest.main.backend?.entryPoint) {
      this.logger.error(`Plugin ${manifest.name} has no backend, skipping backend module loading`);
      return null;
    }

    this.logger.log(`Loading plugin ${manifest.name} from ${manifest.main.backend.directory}`);

    const importedModule = loadPluginEntryExports(
      join(PluginService.PLUGIN_PATH, manifest.main.backend.directory, manifest.main.backend.entryPoint),
    );

    this.logger.log(`Imported module: ${manifest.name}`);

    const exported = importedModule.default as PluginBackendModule | DynamicModule;

    // Register any entities the plugin owns into the shared DataSource BEFORE it
    // initialises (which happens later, at NestFactory.create). The schema is
    // owned by the plugin's migrations — this only makes the entity metadata
    // resolvable so the plugin can use context.getRepository(Entity).
    getImplementationClass().registerPluginEntities(manifest, (exported as PluginBackendModule)?.entities);

    const context = getImplementationClass().createPluginContext(manifest);

    // Register any custom flow nodes contributed by this plugin.
    const configuredFlowNodes = (exported as PluginBackendModule)?.flowNodes;
    const pluginFlowNodes =
      typeof configuredFlowNodes === 'function' ? configuredFlowNodes(context) : configuredFlowNodes;
    if (pluginFlowNodes?.length) {
      registerPluginFlowNodes(manifest.name, pluginFlowNodes);
      this.logger.log(`Registered ${pluginFlowNodes.length} flow node(s) from plugin ${manifest.name}`);
    }

    // Register any audit domains contributed by this plugin. Throws on invalid or
    // colliding declarations, which quarantines the plugin like any other load failure.
    const configuredAuditDomains = (exported as PluginBackendModule)?.auditDomains;
    const pluginAuditDomains =
      typeof configuredAuditDomains === 'function' ? configuredAuditDomains(context) : configuredAuditDomains;
    if (pluginAuditDomains?.length) {
      registerPluginAuditDomains({ name: manifest.name, id: manifest.id }, pluginAuditDomains);
      this.logger.log(
        `Registered audit domain(s) ${pluginAuditDomains.map((declaration) => declaration.domain).join(', ')} from plugin ${manifest.name}`,
      );
    }

    if (typeof (exported as PluginBackendModule)?.register !== 'function') {
      this.logger.warn(
        `Plugin ${manifest.name} does not export a register(context) factory; loading its default export as a static module.`,
      );
      return exported as DynamicModule;
    }

    const pluginModule = (exported as PluginBackendModule).register(context);
    const credentialProvider = (exported as PluginBackendModule).credentialProvisioningProvider;
    if (credentialProvider) {
      MqttCredentialProvisioningService.register(credentialProvider(context));
      this.logger.log(`Registered MQTT credential provider from plugin ${manifest.name}.`);
    }
    return {
      ...pluginModule,
      providers: [
        ...(pluginModule.providers ?? []),
        {
          provide: `plugin-mqtt-cleanup:${manifest.id}`,
          useFactory: () => ({
            onModuleDestroy: () => {
              getImplementationClass().pluginMqtt().clearPlugin(manifest.id);
              getImplementationClass().pluginLiveUpdates().clearPlugin(manifest.id);
            },
          }),
        },
      ],
    };
  }
}
