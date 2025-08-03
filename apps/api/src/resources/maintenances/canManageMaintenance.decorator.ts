import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { CanManageMaintenanceGuard } from './canManageMaintenance.guard';

/**
 * Decorator that ensures the user can manage maintenances for the resource.
 *
 * The user can manage maintenances if they:
 * - Have the 'canManageResources' system permission, OR
 * - Are an introducer for the specific resource, OR
 * - Are an introducer for any group the resource belongs to
 */
export const CanManageMaintenance = () => {
  return applyDecorators(SetMetadata('canManageMaintenance', true), UseGuards(CanManageMaintenanceGuard));
};
