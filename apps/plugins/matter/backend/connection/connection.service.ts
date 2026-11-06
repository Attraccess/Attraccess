import { PLUGIN_CONTEXT, type PluginContext } from '@attraccess/plugins-backend-sdk';
import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { SidecarConnection } from '../client/connection';
import { CredentialUnreadableError, MatterSettingsService } from './settings.service';

/**
 * Owns the sidecar connection for the lifetime of the plugin. Starting it never waits for the sidecar, and neither
 * a missing sidecar nor a bad credential can stop the plugin from loading.
 */
@Injectable()
export class MatterConnectionService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  readonly connection: SidecarConnection;

  constructor(
    @Inject(PLUGIN_CONTEXT) context: PluginContext,
    private readonly settings: MatterSettingsService,
  ) {
    const logger = context.logger;
    this.connection = new SidecarConnection({
      hostVersion: context.hostVersion,
      pluginVersion: context.manifest.version,
      logger: { debug: (message) => logger.debug?.(message), warn: (message) => logger.warn?.(message) },
    });
    this.logger = logger;
  }

  private readonly logger: PluginContext['logger'];

  async onModuleInit(): Promise<void> {
    try {
      await this.reload();
    } catch (error) {
      // Reading the settings must not stop the plugin either.
      this.logger.error?.(
        `Could not load the Matter connection settings: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /** Reads the saved settings and reconnects immediately. */
  async reload(): Promise<void> {
    try {
      this.connection.configure(await this.settings.clientConfig());
    } catch (error) {
      if (!(error instanceof CredentialUnreadableError)) throw error;
      this.connection.misconfigure(error.message);
    }
  }

  onModuleDestroy(): void {
    this.connection.stop();
  }

  onApplicationShutdown(): void {
    this.connection.stop();
  }
}
