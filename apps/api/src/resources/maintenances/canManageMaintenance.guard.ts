import {
  Injectable,
  ExecutionContext,
  CanActivate,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ResourceMaintenanceService } from './maintenance.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

@Injectable()
export class CanManageMaintenanceGuard implements CanActivate {
  private readonly logger = new Logger(CanManageMaintenanceGuard.name);

  constructor(private readonly maintenanceService: ResourceMaintenanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest() as AuthenticatedRequest;
    const user = request.user;

    // If no user is present, deny access
    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Get the resourceId from the URL path
    const resourceIdParam = request.params.resourceId;

    // If no resourceId param, deny access
    if (!resourceIdParam) {
      this.logger.warn(`No resourceId parameter found in request params: ${JSON.stringify(request.params)}`);
      return false;
    }

    // Convert to number
    const resourceId = parseInt(resourceIdParam, 10);

    if (isNaN(resourceId)) {
      throw new BadRequestException(`Resource ID must be a number: ${resourceIdParam}`);
    }

    try {
      const canManage = await this.maintenanceService.canManageMaintenance(user, resourceId);

      if (!canManage) {
        this.logger.warn(`User ${user.id} tried to manage maintenances for resource ${resourceId} without permission`);
      }

      return canManage;
    } catch (error) {
      this.logger.error(`Error checking maintenance management permissions: ${error.message}`, error.stack);
      return false;
    }
  }
}
