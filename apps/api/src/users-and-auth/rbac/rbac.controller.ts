import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permission, Role, UserRole } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { RbacService } from './rbac.service';
import { AssignRoleDto } from './dtos/assign-role.dto';

@ApiTags('RBAC')
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: 'List all roles', operationId: 'listRoles' })
  @ApiResponse({ status: 200, type: [Role] })
  listRoles(): Promise<Role[]> {
    return this.rbacService.getRoles();
  }

  @Get('permissions')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: 'List all permissions', operationId: 'listPermissions' })
  @ApiResponse({ status: 200, type: [Permission] })
  listPermissions(): Promise<Permission[]> {
    return this.rbacService.getPermissions();
  }

  @Get('users/:id/roles')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: "Get a user's role assignments", operationId: 'getUserRoles' })
  @ApiResponse({ status: 200, type: [UserRole] })
  getUserRoles(@Param('id', ParseIntPipe) id: number): Promise<UserRole[]> {
    return this.rbacService.getUserRoles(id);
  }

  @Post('users/:id/roles')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: 'Assign a role to a user', operationId: 'assignRole' })
  @ApiResponse({ status: 201, type: UserRole })
  @ApiResponse({ status: 403, description: 'Actor does not hold all permissions the role grants' })
  async assignRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserRole> {
    const actor = request.user as AuthenticatedUser;
    return this.rbacService.assignRole(id, body.roleId, actor.effectivePermissions ?? new Set());
  }

  @Delete('users/:id/roles/:roleId')
  @Auth('users.roles.manage')
  @ApiOperation({ summary: 'Revoke a role from a user', operationId: 'revokeRole' })
  @ApiResponse({ status: 200, description: 'Role revoked' })
  @ApiResponse({ status: 403, description: 'Cannot remove the last owner' })
  async revokeRole(
    @Param('id', ParseIntPipe) id: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ): Promise<void> {
    return this.rbacService.revokeRole(id, roleId);
  }
}
