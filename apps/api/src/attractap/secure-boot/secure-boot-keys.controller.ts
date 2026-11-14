import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { auditActorOf } from '../../audit/recorder/audit-event';
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

@ApiTags('Attractap')
@Controller('attractap/secure-boot')
@UseInterceptors(ClassSerializerInterceptor)
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class AttractapSecureBootKeysController {
  constructor(@Inject(SecureBootKeyService) private readonly keys: SecureBootKeyService) {}

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
    return await this.keys.createKeys(auditActorOf(req.user));
  }

  @Post('recovery-key/download')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Download the recovery key, encrypted with a passphrase',
    operationId: 'downloadRecoveryKey',
  })
  @ApiResponse({ status: 200, type: KeyFileDownloadDto })
  @Header('Cache-Control', 'no-store')
  async downloadRecoveryKey(
    @Body() body: PassphraseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<KeyFileDownloadDto> {
    return await this.keys.downloadRecoveryKey(body.passphrase, auditActorOf(req.user));
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
    return await this.keys.checkRecoveryKey(body.pem, body.passphrase, auditActorOf(req.user));
  }

  @Post('signing-key/backup')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Download a passphrase-protected signing key backup',
    operationId: 'downloadSigningKeyBackup',
  })
  @ApiResponse({ status: 200, type: KeyFileDownloadDto })
  @Header('Cache-Control', 'no-store')
  async downloadSigningKeyBackup(
    @Body() body: PassphraseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<KeyFileDownloadDto> {
    return await this.keys.downloadSigningKeyBackup(body.passphrase, auditActorOf(req.user));
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
    return await this.keys.restore(body.source, body.pem, body.passphrase, auditActorOf(req.user));
  }
}
