import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../../encryption/encryption.service';
import { LicenseService } from '../../../license/license.service';
import { SsoProviderStorageImplementation } from './sso-provider-storage';

@Injectable()
export class SSOService extends SsoProviderStorageImplementation {
  public constructor(
    @InjectRepository(SSOProvider)
    protected ssoProviderRepository: Repository<SSOProvider>,
    @InjectRepository(SSOProviderOIDCConfiguration)
    protected oidcConfigRepository: Repository<SSOProviderOIDCConfiguration>,
    @InjectRepository(SSOProviderSAMLConfiguration)
    protected samlConfigRepository: Repository<SSOProviderSAMLConfiguration>,
    protected licenseService: LicenseService,
    protected readonly encryptionService: EncryptionService,
  ) {
    super();
  }
}
