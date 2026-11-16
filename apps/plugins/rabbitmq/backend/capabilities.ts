import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { Controller, Get, Req } from '@nestjs/common';
import { RABBITMQ_MANAGE_PERMISSION, RABBITMQ_VIEW_PERMISSION } from './permissions';

export interface RabbitmqCapabilities {
  readonly canManage: boolean;
}

// Tells the UI which manage-tier actions to offer. Purely cosmetic: every
// manage route enforces the permission server-side regardless.
@Controller('rabbitmq')
export class RabbitmqCapabilitiesController {
  @Auth(RABBITMQ_VIEW_PERMISSION)
  @Get('capabilities')
  capabilities(@Req() request: AuthenticatedRequest): RabbitmqCapabilities {
    return { canManage: request.user.effectivePermissions?.has(RABBITMQ_MANAGE_PERMISSION) === true };
  }
}
