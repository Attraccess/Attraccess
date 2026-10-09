import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { WagoManagedRuntimeService } from '../managed/service';
import { wagoAuditPrincipal } from '../../audit/index';
import { WagoNetworkChangeService } from '../../network/service';

@Controller('wago')
@Auth('system.settings.manage')
export class WagoUpdatesController {
  constructor(
    @Inject(WagoManagedRuntimeService) private readonly managed: WagoManagedRuntimeService,
    @Inject(WagoNetworkChangeService) private readonly network: WagoNetworkChangeService,
  ) {}

  @Get('controllers/:id/network-change')
  networkStatus(@Param('id', ParseIntPipe) id: number) {
    return this.network.status(id);
  }

  @Post('controllers/:id/network-change')
  @Header('Cache-Control', 'no-store')
  changeNetwork(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.network.apply(id, body, wagoAuditPrincipal(request));
  }

  @Post('controllers/:id/network-change/retry')
  retryNetwork(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest) {
    return this.network.apply(id, null, wagoAuditPrincipal(request), true);
  }

  @Post('controllers/:id/network-change/retire-credentials')
  retirePreviousCredentials(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest) {
    return this.network.retirePreviousCredentials(id, wagoAuditPrincipal(request));
  }

  @Get('controllers/:id/runtime-update')
  status(@Param('id', ParseIntPipe) id: number) {
    return this.managed.status(id);
  }

  @Get('commissioning/sessions/:id/managed-access')
  sessionStatus(@Param('id', ParseIntPipe) id: number) {
    return this.managed.sessionStatus(id);
  }

  @Post('controllers/:id/runtime-update/retry')
  retryRuntime(@Param('id', ParseIntPipe) id: number) {
    return this.managed.retryRuntime(id);
  }

  @Post('commissioning/sessions/:id/root-recovery')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  recovery(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { confirm?: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    if (body?.confirm !== true || Object.keys(body).length !== 1)
      throw new BadRequestException('Confirm administrator recovery disclosure');
    return this.managed.recoverPassword(id, wagoAuditPrincipal(request));
  }

  @Post('commissioning/sessions/:id/managed-access/retry')
  retry(@Param('id', ParseIntPipe) id: number) {
    return this.managed.retryAccess(id);
  }

  @Post('commissioning/sessions/:id/managed-access/restore')
  restore(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { confirm?: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    if (body?.confirm !== true || Object.keys(body).length !== 1)
      throw new BadRequestException('Confirm bootstrap SSH restoration');
    return this.managed.restoreAccess(id, wagoAuditPrincipal(request));
  }
}
