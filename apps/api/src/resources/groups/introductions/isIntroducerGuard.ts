import {
  Injectable,
  ExecutionContext,
  CanActivate,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceIntroducer, User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

@Injectable()
export class IsResourceGroupIntroducerGuard implements CanActivate {
  private readonly logger = new Logger(IsResourceGroupIntroducerGuard.name);

  constructor(
    @InjectRepository(ResourceIntroducer)
    private resourceIntroducerRepository: Repository<ResourceIntroducer>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User;

    // If no user is present, deny access
    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Check if the user has system permissions to manage all resources
    if ((user as unknown as AuthenticatedUser).effectivePermissions?.has('resources.access.manage') === true) {
      return true;
    }

    // Get the groupId from the URL path
    const groupIdParam = request.params.groupId;

    // If no groupId param, deny access
    if (!groupIdParam) {
      this.logger.warn(`No groupId parameter found in request params: ${JSON.stringify(request.params)}`);
      return false;
    }

    // Convert to number
    const groupId = parseInt(groupIdParam, 10);

    if (isNaN(groupId)) {
      throw new BadRequestException(`Group ID must be a number: ${groupIdParam}`);
    }

    try {
      // Check if the user is an introducer for this resource group
      const introducer = await this.resourceIntroducerRepository.findOne({
        where: {
          user: {
            id: user.id,
          },
          resourceGroup: {
            id: groupId,
          },
        },
      });

      if (introducer) {
        return true;
      }

      this.logger.warn(`User ${user.id} tried to access resource group ${groupId} without permission`);
      return false;
    } catch (error) {
      this.logger.error(`Error checking introducer permissions: ${error.message}`, error.stack);
      return false;
    }
  }
}
