import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permission, Role } from '@attraccess/database-entities';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { RbacService } from './rbac.service';

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
}
