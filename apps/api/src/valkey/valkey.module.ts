import { Global, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ValkeyConfigType } from '../config/valkey.config';
import { logValkeyOutages } from './valkey-outage-logging';

export const VALKEY_CLIENT = 'VALKEY_CLIENT';

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

    const client = new Redis(config.VALKEY_URL, {
      lazyConnect: false,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
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
