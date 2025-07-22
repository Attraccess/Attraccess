import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { IsResourceGroupIntroducerGuard } from './isIntroducerGuard';

/**
 * Decorator to protect routes that require permission to introduce users to a resource group.
 * User must either be an introducer for the resource group (from URL path parameter 'groupId')
 * or have the 'canManageResources' system permission.
 *
 * Usage: @IsResourceGroupIntroducer()
 */
export function IsResourceGroupIntroducer() {
  return applyDecorators(
    UseGuards(DualAuthGuard, IsResourceGroupIntroducerGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'User is not authenticated' }),
    ApiForbiddenResponse({
      description: 'User does not have permission to introduce users to this resource group',
    })
  );
}
