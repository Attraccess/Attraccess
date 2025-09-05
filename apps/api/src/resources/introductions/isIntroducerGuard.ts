import {
  Injectable,
  ExecutionContext,
  CanActivate,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';

@Injectable()
export class IsResourceIntroducerGuard implements CanActivate {
  private readonly logger = new Logger(IsResourceIntroducerGuard.name);

  constructor(private readonly resourceIntroducersService: ResourceIntroducersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

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
      throw new BadRequestException(`Group ID must be a number: ${resourceIdParam}`);
    }

    const isIntroducer = await this.resourceIntroducersService.isIntroducer(resourceId, user.id, true);

    return isIntroducer || user.systemPermissions.canManageResources;
  }
}
