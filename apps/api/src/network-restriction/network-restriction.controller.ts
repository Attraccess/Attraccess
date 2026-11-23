import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { auditActorOf } from '../audit/recorder/audit-event';
import { NetworkRestrictionAdministrationService } from './network-restriction-administration.service';
import { NetworkRestrictionService } from './network-restriction.service';
import {
  NetworkRestrictionRoleMatrixDto,
  NetworkRestrictionSettingsDto,
  NetworkRestrictionStatusDto,
  UpdateNetworkRestrictionRoleMatrixDto,
  UpdateNetworkRestrictionSettingsDto,
} from './network-restriction.dto';

@ApiTags('Network restriction')
@Controller()
export class NetworkRestrictionController {
  constructor(
    private readonly restriction: NetworkRestrictionService,
    private readonly administration: NetworkRestrictionAdministrationService,
  ) {}

  @Get('network-restriction/me')
  @Auth()
  @ApiOperation({
    summary: 'Which restricted resource actions the caller may do from where they are',
    operationId: 'getNetworkRestrictionStatus',
  })
  @ApiResponse({ status: 200, type: NetworkRestrictionStatusDto })
  status(@Req() req: AuthenticatedRequest): Promise<NetworkRestrictionStatusDto> {
    return this.restriction.statusOf(req);
  }

  @Get('settings/network-restriction')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get the network restriction settings', operationId: 'getNetworkRestrictionSettings' })
  @ApiResponse({ status: 200, type: NetworkRestrictionSettingsDto })
  settings(@Req() req: AuthenticatedRequest): Promise<NetworkRestrictionSettingsDto> {
    return this.administration.settings(req);
  }

  @Patch('settings/network-restriction')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update the network restriction settings', operationId: 'updateNetworkRestrictionSettings' })
  @ApiBody({ type: UpdateNetworkRestrictionSettingsDto })
  @ApiResponse({ status: 200, type: NetworkRestrictionSettingsDto })
  @ApiResponse({ status: 400, description: 'An invalid range, or enabling without any allowed range.' })
  // Raw JSON for strict validation: global implicit conversion would coerce "false" to true.
  updateSettings(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<NetworkRestrictionSettingsDto> {
    return this.administration.updateSettings(body, auditActorOf(req.user), req);
  }

  @Get('settings/network-restriction/role-actions')
  @Auth('system.settings.manage')
  @ApiOperation({
    summary: 'Get which actions each role may perform from outside the allowed network',
    operationId: 'getNetworkRestrictionRoleActions',
  })
  @ApiResponse({ status: 200, type: NetworkRestrictionRoleMatrixDto })
  roleActions(): Promise<NetworkRestrictionRoleMatrixDto> {
    return this.administration.roleMatrix();
  }

  @Patch('settings/network-restriction/role-actions')
  @Auth('system.settings.manage')
  @ApiOperation({
    summary: 'Set which actions the listed roles may perform from outside the allowed network',
    operationId: 'updateNetworkRestrictionRoleActions',
  })
  @ApiBody({ type: UpdateNetworkRestrictionRoleMatrixDto })
  @ApiResponse({ status: 200, type: NetworkRestrictionRoleMatrixDto })
  @ApiResponse({ status: 400, description: 'An unknown role or action.' })
  updateRoleActions(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<NetworkRestrictionRoleMatrixDto> {
    return this.administration.updateRoleMatrix(body, auditActorOf(req.user));
  }
}
