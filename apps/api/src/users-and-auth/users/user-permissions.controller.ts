import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, Auth, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { RbacService } from '../rbac/rbac.service';
import { AssignRoleDto } from '../rbac/dtos/assign-role.dto';
import { UserPermissionsService } from './user-permissions.service';
import { UserRoleDto, toUserRoleDto } from './dtos/user.dto';
import { auditOriginOf } from '../../audit/recorder/audit-event';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UserPermissionsController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly permissionsService: UserPermissionsService,
  ) {}

  private readonly logger = new Logger(UserPermissionsController.name);

  @Get(':id/roles')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: "Get a user's role assignments", operationId: 'getUserRoleAssignments' })
  @ApiResponse({ status: 200, type: [UserRoleDto] })
  async getUserRoles(@Param('id', ParseIntPipe) id: number): Promise<UserRoleDto[]> {
    return (await this.rbacService.getUserRoles(id)).map(toUserRoleDto);
  }

  @Post(':id/roles')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: 'Assign a role to a user', operationId: 'assignRoleToUser' })
  @ApiResponse({ status: 201, type: UserRoleDto })
  async assignRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserRoleDto> {
    const actor = request.user as AuthenticatedUser;
    if (actor.id === id) {
      throw new ForbiddenException('You cannot modify your own roles');
    }
    return toUserRoleDto(await this.permissionsService.assignRole(id, body.roleId, actor, auditOriginOf(request)));
  }

  @Delete(':id/roles/:roleId')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: 'Revoke a role from a user', operationId: 'revokeRoleFromUser' })
  @ApiResponse({ status: 200, description: 'Role revoked' })
  async revokeRole(
    @Param('id', ParseIntPipe) id: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const actor = request.user as AuthenticatedUser;
    if (actor.id === id) {
      throw new ForbiddenException('You cannot modify your own roles');
    }
    await this.permissionsService.revokeRole(id, roleId, actor, auditOriginOf(request));
  }
}
