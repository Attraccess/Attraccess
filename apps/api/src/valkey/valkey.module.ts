import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ValkeyConfigType } from '../config/valkey.config';

export const VALKEY_CLIENT = 'VALKEY_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: VALKEY_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis | null => {
        const config = configService.get<ValkeyConfigType>('valkey');
        if (!config?.VALKEY_URL) {
          return null;
        }
        const logger = new Logger('ValkeyModule');
        const client = new Redis(config.VALKEY_URL, {
          lazyConnect: false,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
        });
        client.on('connect', () => logger.log('Connected to Valkey'));
        client.on('error', (err) => logger.error('Valkey connection error', err));
        return client;
      },
    },
  ],
  exports: [VALKEY_CLIENT],
})
export class ValkeyModule {}
