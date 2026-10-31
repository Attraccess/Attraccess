import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { auditSubjectKeyId, recordAdministrationSafely } from '../audit/policies/administration';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { CardWriterSettingsDto } from './dtos/card-writer-settings.dto';
import { CardWriterPolicyService } from './websockets/card-writer-policy.service';

/** Audit values are capped at 256 characters; a longer reader list is recorded as a count instead. */
const AUDIT_VALUE_MAX_LENGTH = 256;

/** Audit rows (setting key, before, after) for every value the update changed. */
export function cardWriterSettingChanges(
  before: CardWriterSettingsDto,
  after: CardWriterSettingsDto,
): Array<[string, string, string]> {
  const changes: Array<[string, string, string]> = [];
  if (before.mode !== after.mode) changes.push(['attractap.cardWriterMode', before.mode, after.mode]);
  const oldReaders = before.readerIds.join(',');
  const newReaders = after.readerIds.join(',');
  if (oldReaders !== newReaders) {
    if (oldReaders.length <= AUDIT_VALUE_MAX_LENGTH && newReaders.length <= AUDIT_VALUE_MAX_LENGTH) {
      changes.push(['attractap.cardWriterReaders', oldReaders, newReaders]);
    } else {
      changes.push([
        'attractap.cardWriterReaderCount',
        String(before.readerIds.length),
        String(after.readerIds.length),
      ]);
    }
  }
  return changes;
}

@ApiTags('Attractap')
@Controller('attractap/card-writer-settings')
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class CardWriterSettingsController {
  @Inject(CardWriterPolicyService)
  private readonly policy: CardWriterPolicyService;

  @Inject(AuditService)
  private readonly audit: AuditService;

  // Every signed-in user may enroll and reset their own cards (POST /attractap/enroll-nfc-card and
  // /reset-nfc-card only need a login), and the reader picker needs this list to offer only allowed
  // readers. It holds reader ids that GET /attractap/readers already shows to the same users.
  @Get()
  @Auth()
  @ApiOperation({
    summary: 'Which readers may enroll and reset cards',
    operationId: 'getCardWriterSettings',
  })
  @ApiResponse({ status: 200, type: CardWriterSettingsDto })
  get(): Promise<CardWriterSettingsDto> {
    return this.policy.get();
  }

  @Put()
  @Auth('system.settings.manage')
  @ApiOperation({
    summary: 'Choose which readers may enroll and reset cards',
    operationId: 'updateCardWriterSettings',
  })
  @ApiBody({ type: CardWriterSettingsDto })
  @ApiResponse({ status: 200, type: CardWriterSettingsDto })
  async update(
    @Body() settings: CardWriterSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CardWriterSettingsDto> {
    const before = await this.policy.get();
    const after = await this.policy.set(settings);
    for (const [settingKey, oldValue, newValue] of cardWriterSettingChanges(before, after)) {
      await recordAdministrationSafely(this.audit, {
        action: 'settings.updated',
        actorId: req.user.id,
        authenticationMethod: req.user.authenticationMethod,
        apiTokenId: req.user.apiTokenId,
        subjectType: 'setting',
        subjectId: auditSubjectKeyId(settingKey),
        details: { settingKey, before: oldValue, after: newValue },
      });
    }
    return after;
  }
}
