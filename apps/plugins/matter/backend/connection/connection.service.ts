import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { SidecarConnection } from '../client/connection';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { CredentialUnreadableError, MatterSettingsService } from './settings.service';

/** The longest the plugin's stop waits for work that still needs the sidecar (cancelling a commissioning session). */
export const STOP_GRACE_MS = 3_000;

/**
 * Owns the sidecar connection for the lifetime of the plugin. Starting it never waits for the sidecar, and neither
 * a missing sidecar nor a bad credential can stop the plugin from loading.
 */
@Injectable()
export class MatterConnectionService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  readonly connection: SidecarConnection;

  constructor(
    @Inject(PLUGIN_CONTEXT) context: PluginContext,
    @Inject(MatterSettingsService) private readonly settings: MatterSettingsService,
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
  private readonly beforeStop = new Set<() => Promise<void>>();

  /**
   * Work that still needs the sidecar when the plugin stops, such as cancelling a running commissioning session. It
   * runs before the connection closes, for at most STOP_GRACE_MS. Returns the function that withdraws it.
   */
  beforeStopping(task: () => Promise<void>): () => void {
    this.beforeStop.add(task);
    return () => this.beforeStop.delete(task);
  }

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

  async onModuleDestroy(): Promise<void> {
    const tasks = [...this.beforeStop];
    this.beforeStop.clear();
    if (tasks.length > 0) {
      let timer: NodeJS.Timeout | undefined;
      const grace = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, STOP_GRACE_MS);
        timer.unref();
      });
      await Promise.race([Promise.allSettled(tasks.map((task) => Promise.resolve().then(task))), grace]);
      clearTimeout(timer);
    }
    this.connection.stop();
  }

  onApplicationShutdown(): void {
    this.connection.stop();
  }
}
