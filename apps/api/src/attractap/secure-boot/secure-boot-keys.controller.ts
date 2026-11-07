import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../../audit/audit.service';
import { AttractapAuditEvent } from '../../audit/policies/domain-events';
import { LicenseModuleType } from '../../license/license.service';
import { RequiresLicense } from '../../license/require-license.decorator';
import {
  KeyFileDownloadDto,
  KeyFileDto,
  PassphraseDto,
  RecoveryCheckResultDto,
  RestoreKeysDto,
  SecureBootKeyFingerprintsDto,
  SecureBootKeysStateDto,
} from '../dtos/secure-boot-keys.dto';
import { SecureBootKeyService } from './secure-boot-key.service';

/** The installation has one Secure Boot key set; audit events use this subject id. */
const INSTALLATION_SUBJECT_ID = 1;

@ApiTags('Attractap')
@Controller('attractap/secure-boot')
@UseInterceptors(ClassSerializerInterceptor)
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class AttractapSecureBootKeysController {
  constructor(
    @Inject(SecureBootKeyService) private readonly keys: SecureBootKeyService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async record(
    req: AuthenticatedRequest,
    action: AttractapAuditEvent['action'],
    details: AttractapAuditEvent['details'],
  ): Promise<void> {
    const method = req.user.authenticationMethod ?? 'session';
    await this.audit
      .recordAttractap({
        action,
        subjectType: 'attractap.installation',
        subjectId: INSTALLATION_SUBJECT_ID,
        actorId: req.user.id,
        authenticationMethod: method,
        ...(method === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
        details,
      })
      .catch(() => undefined);
  }

  @Get('keys')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Secure Boot key status; never includes key material', operationId: 'getSecureBootKeys' })
  @ApiResponse({ status: 200, type: SecureBootKeysStateDto })
  async getKeys(): Promise<SecureBootKeysStateDto> {
    return await this.keys.getState();
  }

  @Post('keys')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Create the signing and recovery keys', operationId: 'createSecureBootKeys' })
  @ApiResponse({ status: 201, type: SecureBootKeyFingerprintsDto })
  @ApiResponse({ status: 409, description: 'Keys exist and readers have digests burned with them' })
  async createKeys(@Req() req: AuthenticatedRequest): Promise<SecureBootKeyFingerprintsDto> {
    const result = await this.keys.createKeys();
    await this.record(req, 'reader.secure_keys_created', result);
    return result;
  }

  @Post('recovery-key/download')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Download the recovery key, encrypted with a passphrase',
    operationId: 'downloadRecoveryKey',
  })
  @ApiResponse({ status: 200, type: KeyFileDownloadDto })
  async downloadRecoveryKey(
    @Body() body: PassphraseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<KeyFileDownloadDto> {
    const result = await this.keys.downloadRecoveryKey(body.passphrase);
    await this.record(req, 'reader.recovery_key_downloaded', { recoveryFingerprint: result.fingerprint });
    return result;
  }

  @Post('recovery-key/check')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Prove the recovery file; the server then deletes the private key',
    operationId: 'checkRecoveryKey',
  })
  @ApiResponse({ status: 200, type: RecoveryCheckResultDto })
  async checkRecoveryKey(@Body() body: KeyFileDto, @Req() req: AuthenticatedRequest): Promise<RecoveryCheckResultDto> {
    const result = await this.keys.checkRecoveryKey(body.pem, body.passphrase);
    await this.record(req, 'reader.recovery_key_verified', { recoveryFingerprint: result.fingerprint });
    return result;
  }

  @Post('signing-key/backup')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Download a passphrase-protected signing key backup',
    operationId: 'downloadSigningKeyBackup',
  })
  @ApiResponse({ status: 200, type: KeyFileDownloadDto })
  async downloadSigningKeyBackup(
    @Body() body: PassphraseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<KeyFileDownloadDto> {
    const result = await this.keys.downloadSigningKeyBackup(body.passphrase);
    await this.record(req, 'reader.signing_key_backup_downloaded', { signingFingerprint: result.fingerprint });
    return result;
  }

  @Post('restore')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Restore from a signing key backup or the recovery file',
    operationId: 'restoreSecureBootKeys',
  })
  @ApiResponse({ status: 200, type: SecureBootKeyFingerprintsDto })
  @ApiResponse({ status: 409, description: 'Readers are secured with the current signing key' })
  async restore(@Body() body: RestoreKeysDto, @Req() req: AuthenticatedRequest): Promise<SecureBootKeyFingerprintsDto> {
    const result = await this.keys.restore(body.source, body.pem, body.passphrase);
    await this.record(req, 'reader.secure_keys_restored', { ...result, source: body.source });
    return result;
  }
}
