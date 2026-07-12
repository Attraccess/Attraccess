import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@attraccess/database-entities';
import { AuthenticatedRequest, Auth, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { RbacService } from '../rbac/rbac.service';
import { AssignRoleDto } from '../rbac/dtos/assign-role.dto';
import { UserPermissionsService } from './user-permissions.service';
import { UsersService } from './users.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UserPermissionsController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly permissionsService: UserPermissionsService,
    private readonly usersService: UsersService,
  ) {}

  @Get(':id/roles')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: "Get a user's role assignments", operationId: 'getUserRoleAssignments' })
  @ApiResponse({ status: 200, type: [UserRole] })
  getUserRoles(@Param('id', ParseIntPipe) id: number): Promise<UserRole[]> {
    return this.rbacService.getUserRoles(id);
  }

  @Post(':id/roles')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: 'Assign a role to a user', operationId: 'assignRoleToUser' })
  @ApiResponse({ status: 201, type: UserRole })
  async assignRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserRole> {
    const actor = request.user as AuthenticatedUser;
    const result = await this.rbacService.assignRole(id, body.roleId, actor.effectivePermissions ?? new Set());
    const user = await this.usersService.findOne({ id });
    if (user) this.permissionsService.notifyPermissionsChanged(user, actor.id);
    return result;
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
    await this.rbacService.revokeRole(id, roleId, actor.effectivePermissions ?? new Set());
    const user = await this.usersService.findOne({ id });
    if (!user) throw new UserNotFoundException(id);
    this.permissionsService.notifyPermissionsChanged(user, actor.id);
  }
}
