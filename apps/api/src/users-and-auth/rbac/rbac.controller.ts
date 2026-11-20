import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthAny, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { RbacService } from './rbac.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { RoleWithUsageDto, toRoleWithUsageDto } from './dtos/role-with-usage.dto';
import { PermissionDto, RoleDto, toPermissionDto, toRoleDto } from './dtos/role.dto';
import { auditOriginOf } from '../../audit/recorder/audit-event';

@ApiTags('RBAC')
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @AuthAny('users.roles.manage', 'system.sso.manage', 'system.settings.manage')
  @ApiOperation({ summary: 'List all roles with permissions and user counts', operationId: 'listRoles' })
  @ApiResponse({ status: 200, type: [RoleWithUsageDto] })
  async listRoles(): Promise<RoleWithUsageDto[]> {
    return (await this.rbacService.getRolesWithUsage()).map(toRoleWithUsageDto);
  }

  @Get('permissions')
  @AuthAny('users.roles.manage', 'system.settings.manage')
  @ApiOperation({ summary: 'List all permissions', operationId: 'listPermissions' })
  @ApiResponse({ status: 200, type: [PermissionDto] })
  async listPermissions(): Promise<PermissionDto[]> {
    return (await this.rbacService.getPermissions()).map(toPermissionDto);
  }

  @Post('roles')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Create a new custom role', operationId: 'createRole' })
  @ApiResponse({ status: 201, type: RoleDto })
  async createRole(@Body() body: CreateRoleDto, @Req() request: AuthenticatedRequest): Promise<RoleDto> {
    const actor = request.user as AuthenticatedUser;
    return toRoleDto(
      await this.rbacService.createRole(body, actor.effectivePermissions ?? new Set(), auditOriginOf(request)),
    );
  }

  @Patch('roles/:id')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: "Update a custom role's name, description, or permission set", operationId: 'updateRole' })
  @ApiResponse({ status: 200, type: RoleDto })
  async updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoleDto> {
    const actor = request.user as AuthenticatedUser;
    return toRoleDto(
      await this.rbacService.updateRole(id, body, actor.effectivePermissions ?? new Set(), auditOriginOf(request)),
    );
  }

  @Delete('roles/:id')
  @Auth('system.settings.manage')
  @ApiOperation({
    summary: 'Delete a custom role, removing or reassigning its user assignments',
    operationId: 'deleteRole',
  })
  @ApiQuery({
    name: 'reassignToRoleId',
    required: false,
    type: Number,
    description: 'Optional role ID to assign to all affected users instead of just removing the assignment',
  })
  @ApiResponse({ status: 200, description: 'Role deleted' })
  async deleteRole(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Query('reassignToRoleId', new ParseIntPipe({ optional: true })) reassignToRoleId?: number,
  ): Promise<void> {
    const actor = request.user as AuthenticatedUser;
    await this.rbacService.deleteRole(
      id,
      await this.rbacService.getGrantCeiling(actor),
      auditOriginOf(request),
      reassignToRoleId,
    );
  }
}
