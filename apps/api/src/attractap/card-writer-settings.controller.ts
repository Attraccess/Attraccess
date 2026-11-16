import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { auditActorOf } from '../audit/recorder/audit-event';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { AttractapService } from './attractap.service';
import { CardWriterSettingsDto } from './dtos/card-writer-settings.dto';
import { READER_NOT_PAIRED } from './reader-pairing';
import { CardWriterPolicyService } from './websockets/card-writer-policy.service';

@ApiTags('Attractap')
@Controller('attractap/card-writer-settings')
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class CardWriterSettingsController {
  @Inject(CardWriterPolicyService)
  private readonly policy: CardWriterPolicyService;

  @Inject(AttractapService)
  private readonly readers: AttractapService;

  /** Ids of the readers that completed pairing: the only ones the setting may name. */
  private async pairedReaderIds(): Promise<Set<number>> {
    return new Set((await this.readers.getPairedReaders()).map((reader) => reader.id));
  }

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
  async get(): Promise<CardWriterSettingsDto> {
    // A reader that is not paired is never listed, even if it was named before its pairing was removed.
    const [settings, paired] = await Promise.all([this.policy.get(), this.pairedReaderIds()]);
    return { ...settings, readerIds: settings.readerIds.filter((id) => paired.has(id)) };
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
    const paired = await this.pairedReaderIds();
    if (settings.readerIds.some((id) => !paired.has(id))) throw new BadRequestException(READER_NOT_PAIRED);
    return this.policy.update(settings, auditActorOf(req.user));
  }
}
