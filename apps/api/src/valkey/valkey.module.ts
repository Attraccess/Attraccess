import { Global, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ValkeyConfigType } from '../config/valkey.config';
import { redactValkeyCommandErrors } from './valkey-command-errors';
import { describeValkeyError, logValkeyOutages } from './valkey-outage-logging';

export const VALKEY_CLIENT = 'VALKEY_CLIENT';

// ioredis 6 backs off exponentially up to 5 s. A request fails after maxRetriesPerRequest reconnect attempts, so
// during an outage that left callers waiting about 20 s for the 503; keep the ioredis 5 delay (linear, at most 2 s).
export const valkeyRetryDelay = (times: number): number => Math.min(times * 50, 2000);

/**
 * A Valkey that keeps the connection open but stops answering (frozen, or a network partition without a reset) never
 * makes ioredis reconnect, so without a timeout every request that needs Valkey would hang and run late once it
 * answers again. Subscribers (`duplicate`) must turn it off: their SUBSCRIBE waits until Valkey is reachable.
 */
export const VALKEY_COMMAND_TIMEOUT_MS = 5_000;

@Injectable()
export class ValkeyClientService implements OnApplicationShutdown {
  public readonly client: Redis | null;
  private readonly logger = new Logger(ValkeyClientService.name);

  constructor(configService: ConfigService) {
    const config = configService.get<ValkeyConfigType>('valkey');
    if (!config?.VALKEY_URL) {
      this.client = null;
      return;
    }

    let client: Redis;
    try {
      client = new Redis(config.VALKEY_URL, {
        lazyConnect: false,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryStrategy: valkeyRetryDelay,
        commandTimeout: VALKEY_COMMAND_TIMEOUT_MS,
      });
    } catch (error) {
      // The URL error carries the whole URL, password included, in `input`; rethrow without it.
      // eslint-disable-next-line preserve-caught-error -- attaching the cause would leak the password.
      throw new Error(
        `VALKEY_URL is not a valid URL (${describeValkeyError(error)}); percent-encode reserved characters in the password`,
      );
    }
    redactValkeyCommandErrors(client);
    logValkeyOutages(client, this.logger, {
      lost: (reason) => `Lost connection to Valkey (${reason}); retrying`,
      reconnected: 'Reconnected to Valkey',
      connected: 'Connected to Valkey',
    });
    this.client = client;
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client) {
      return;
    }
    this.logger.log('Shutting down Valkey client');
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

@Global()
@Module({
  providers: [
    ValkeyClientService,
    {
      provide: VALKEY_CLIENT,
      inject: [ValkeyClientService],
      useFactory: (svc: ValkeyClientService): Redis | null => svc.client,
    },
  ],
  exports: [VALKEY_CLIENT],
})
export class ValkeyModule {}
