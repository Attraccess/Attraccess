import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bonjour, ServiceConfig } from 'bonjour-service';
import type { Service } from 'bonjour-service';
import { AppConfigType } from '../../config/app.config';

type MdnsTxtRecord = Record<string, string>;

@Injectable()
export class MdnsAdvertiserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MdnsAdvertiserService.name);
  private bonjour?: Bonjour;
  private service?: Service;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const appConfig = this.configService.get<AppConfigType>('app');

    if (!appConfig) {
      this.logger.warn("App configuration ('app') not found. Skipping mDNS advertisement.");
      return;
    }

    if (!appConfig.ATTRACCESS_MDNS_ENABLED) {
      return;
    }

    const { serviceConfig, scheme } = this.buildServiceConfig(appConfig);

    try {
      this.bonjour = new Bonjour();
      this.service = this.bonjour.publish(serviceConfig);
      this.logger.log(
        `mDNS advertising '${serviceConfig.name}' as _${serviceConfig.type}._${serviceConfig.protocol ?? 'tcp'} on port ${serviceConfig.port} (scheme=${scheme})`,
      );
    } catch (error) {
      const details = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error('Failed to publish mDNS service', details);
    }
  }

  onModuleDestroy(): void {
    if (!this.bonjour) {
      return;
    }

    try {
      if (this.service?.stop) {
        this.service.stop();
      }
      this.bonjour.unpublishAll();
      this.bonjour.destroy();
      this.logger.log('mDNS advertisement stopped.');
    } catch (error) {
      const details = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error('Failed to stop mDNS advertisement cleanly', details);
    }
  }

  private buildServiceConfig(appConfig: AppConfigType): { serviceConfig: ServiceConfig; scheme: string } {
    const attraccessUrl = new URL(appConfig.ATTRACCESS_URL);
    const scheme = attraccessUrl.protocol.replace(':', '');
    const advertisedPort = attraccessUrl.port
      ? Number(attraccessUrl.port)
      : scheme === 'https'
        ? 443
        : 80;
    const serviceName = 'Attraccess API';
    const serviceType = 'attraccess';
    const apiPath = appConfig.GLOBAL_PREFIX ? `/${appConfig.GLOBAL_PREFIX}` : '/';

    const txt: MdnsTxtRecord = {
      path: apiPath,
      scheme,
      ssl: scheme === 'https' ? '1' : '0',
      version: appConfig.VERSION,
      baseUrl: appConfig.ATTRACCESS_URL,
      hostname: attraccessUrl.hostname,
    };

    if (appConfig.SSL_GENERATE_SELF_SIGNED_CERTIFICATES) {
      txt.selfSigned = '1';
    }

    return {
      scheme,
      serviceConfig: {
        name: serviceName,
        type: serviceType,
        port: advertisedPort,
        protocol: 'tcp',
        txt,
      },
    };
  }

}
