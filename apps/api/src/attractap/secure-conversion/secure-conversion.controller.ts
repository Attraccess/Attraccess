import { Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AttractapSecureConversionRecord } from '@attraccess/application-models';
import { Auth, AuthAny, AuthenticatedRequest, NotAnMcpTool } from '@attraccess/plugins-backend-sdk';
import { auditActorOf } from '../../audit/recorder/audit-event';
import { LicenseModuleType } from '../../license/license.service';
import { RequiresLicense } from '../../license/require-license.decorator';
import {
  ActiveSecureConversionDto,
  SecureConversionDto,
  SecureConversionEligibilityDto,
  SecureConversionPreflightDto,
  SecureConversionStatusDto,
  StartSecureConversionDto,
} from '../dtos/secure-conversion.dto';
import { SecureConversionService, type ConversionStatus } from './secure-conversion.service';

/** Only what the UI shows: the burn report (reader MAC) and actor stay on the server. */
function toDto(conversion: AttractapSecureConversionRecord | null): SecureConversionDto | null {
  if (!conversion) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { burnReport, actorId, ...shown } = conversion;
  return shown;
}

const toStatusDto = (status: ConversionStatus): SecureConversionStatusDto => ({
  ...status,
  conversion: toDto(status.conversion),
});

@ApiTags('Attractap')
@Controller('attractap')
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class SecureConversionController {
  constructor(@Inject(SecureConversionService) private readonly conversions: SecureConversionService) {}

  /**
   * Reader managers without `system.settings.manage` may ask too, so the editor can show the action disabled with
   * the missing permission; they learn only whether the action exists, never the other gates.
   */
  @Get('readers/:id/secure-conversion/eligibility')
  @AuthAny('system.settings.manage', 'resources.update')
  @ApiOperation({
    summary: 'Whether a reader can be secured now, with reasons',
    operationId: 'getSecureConversionEligibility',
  })
  @ApiResponse({ status: 200, type: SecureConversionEligibilityDto })
  async eligibility(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<SecureConversionEligibilityDto> {
    const canSecure = req.user.effectivePermissions?.has('system.settings.manage') === true;
    return await this.conversions.eligibilityFor(id, canSecure);
  }

  @Post('readers/:id/secure-conversion/preflight')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Read-only preflight of a reader before securing it',
    operationId: 'runSecureConversionPreflight',
  })
  @ApiResponse({ status: 200, type: SecureConversionPreflightDto })
  @ApiResponse({ status: 409, description: 'A gate is not met, or the reader did not answer' })
  async preflight(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<SecureConversionPreflightDto> {
    return await this.conversions.preflight(id, auditActorOf(req.user));
  }

  @Get('readers/:id/secure-conversion')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: "A reader's latest conversion, for polling", operationId: 'getSecureConversionStatus' })
  @ApiResponse({ status: 200, type: SecureConversionStatusDto })
  async status(@Param('id', ParseIntPipe) id: number): Promise<SecureConversionStatusDto> {
    return toStatusDto(await this.conversions.status(id));
  }

  @Post('readers/:id/secure-conversion')
  @Auth('system.settings.manage')
  @NotAnMcpTool('Irreversible hardware action: burns eFuses and needs the typed confirmation in the web UI')
  @ApiOperation({ summary: 'Start securing a reader', operationId: 'startSecureConversion' })
  @ApiResponse({ status: 201, type: SecureConversionStatusDto })
  @ApiResponse({ status: 409, description: 'A gate is not met or another conversion is running' })
  async start(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: StartSecureConversionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SecureConversionStatusDto> {
    return toStatusDto(await this.conversions.start(id, body.confirmName, auditActorOf(req.user)));
  }

  @Post('readers/:id/secure-conversion/cancel')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a conversion before the burn', operationId: 'cancelSecureConversion' })
  @ApiResponse({ status: 200, type: SecureConversionStatusDto })
  async cancel(@Param('id', ParseIntPipe) id: number): Promise<SecureConversionStatusDto> {
    return toStatusDto(await this.conversions.cancel(id));
  }

  @Post('readers/:id/secure-conversion/retry')
  @Auth('system.settings.manage')
  @HttpCode(200)
  @NotAnMcpTool('Irreversible hardware action: burns eFuses and needs the typed confirmation in the web UI')
  @ApiOperation({ summary: 'Retry a failed conversion when safe', operationId: 'retrySecureConversion' })
  @ApiResponse({ status: 200, type: SecureConversionStatusDto })
  async retry(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<SecureConversionStatusDto> {
    return toStatusDto(await this.conversions.retry(id, auditActorOf(req.user)));
  }

  @Get('secure-conversions/active')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: "The installation's active conversion", operationId: 'getActiveSecureConversion' })
  @ApiResponse({ status: 200, type: ActiveSecureConversionDto })
  async active(): Promise<ActiveSecureConversionDto> {
    return { conversion: toDto(await this.conversions.active()) };
  }
}
