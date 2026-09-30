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
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { wagoAuditPrincipal } from './wago-audit';

@Controller('wago')
@Auth('system.settings.manage')
export class WagoUpdatesController {
  constructor(@Inject(WagoManagedRuntimeService) private readonly managed: WagoManagedRuntimeService) {}

  @Get('controllers/:id/runtime-update')
  status(@Param('id', ParseIntPipe) id: number) {
    return this.managed.status(id);
  }

  @Get('commissioning/sessions/:id/managed-access')
  sessionStatus(@Param('id', ParseIntPipe) id: number) {
    return this.managed.sessionStatus(id);
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
