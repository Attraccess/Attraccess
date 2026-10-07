import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../../encryption/encryption.service';
import { LicenseService } from '../../../license/license.service';
import { CreateOIDCConfigurationDto, CreateSAMLConfigurationDto } from './dto/create-sso-provider.dto';
import { UpdateOIDCConfigurationDto, UpdateSAMLConfigurationDto } from './dto/update-sso-provider.dto';

export abstract class SSOServiceRouteContext {
  protected abstract ssoProviderRepository: Repository<SSOProvider>;
  protected abstract decryptProviderSecrets(provider?: SSOProvider | null): void;
  protected abstract licenseService: LicenseService;
  protected abstract createOIDCConfiguration(
    providerId: number,
    config: CreateOIDCConfigurationDto,
    repository?: Repository<SSOProviderOIDCConfiguration>,
  ): Promise<SSOProviderOIDCConfiguration>;
  protected abstract createSAMLConfiguration(
    providerId: number,
    config: CreateSAMLConfigurationDto,
    repository?: Repository<SSOProviderSAMLConfiguration>,
  ): Promise<SSOProviderSAMLConfiguration>;
  public abstract getProviderById(id: number): Promise<SSOProvider>;
  protected abstract updateOIDCConfiguration(
    providerId: number,
    updateConfig: UpdateOIDCConfigurationDto,
    repository?: Repository<SSOProviderOIDCConfiguration>,
  ): Promise<SSOProviderOIDCConfiguration>;
  protected abstract updateSAMLConfiguration(
    providerId: number,
    config: UpdateSAMLConfigurationDto,
    repository?: Repository<SSOProviderSAMLConfiguration>,
  ): Promise<SSOProviderSAMLConfiguration>;
  protected abstract oidcConfigRepository: Repository<SSOProviderOIDCConfiguration>;
  protected abstract readonly encryptionService: EncryptionService;
  protected abstract samlConfigRepository: Repository<SSOProviderSAMLConfiguration>;
  protected abstract normalizeCertificate(cert: string): string;
  protected abstract encryptPrivateKey(privateKey: string): string;
  protected abstract ensureSigningMaterialAvailability(
    shouldSignRequests: boolean,
    spCertificate?: string | null,
    encryptedPrivateKey?: string | null,
  ): void;
  protected abstract getEncryptionKeyId(): string;
  protected abstract canonicalizePrivateKey(privateKey: string): string;
}
