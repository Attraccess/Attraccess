import { Auth } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { CardWriterSettingsDto } from './dtos/card-writer-settings.dto';
import { CardWriterPolicyService } from './websockets/card-writer-policy.service';

@ApiTags('Attractap')
@Controller('attractap/card-writer-settings')
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class CardWriterSettingsController {
  @Inject(CardWriterPolicyService)
  private readonly policy: CardWriterPolicyService;

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
  update(@Body() settings: CardWriterSettingsDto): Promise<CardWriterSettingsDto> {
    return this.policy.set(settings);
  }
}
