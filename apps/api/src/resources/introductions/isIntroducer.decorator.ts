import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthRequirement, DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { IsResourceIntroducerGuard } from './isIntroducerGuard';

/**
 * Decorator to protect routes that require permission to introduce users to a resource.
 * User must either be an introducer for the resource (from URL path parameter 'resourceId')
 * or hold the `resources.access.manage` RBAC permission.
 *
 * Usage: @IsResourceIntroducer()
 */
export function IsResourceIntroducer() {
  return applyDecorators(
    // No permission list: the guard decides per resource. Empty keeps it an MCP tool, the REST guard stays in charge.
    AuthRequirement({ all: [], any: [], sessionOnly: false }),
    UseGuards(DualAuthGuard, IsResourceIntroducerGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'User is not authenticated' }),
    ApiForbiddenResponse({
      description: 'User does not have permission to introduce users to this resource',
    }),
  );
}
