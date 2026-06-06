import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SystemPermissions, User } from '@attraccess/database-entities';
import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { UpdateUserPermissionsDto } from './dtos/updateUserPermissions.dto';
import { BulkUpdateUserPermissionsDto } from './dtos/bulkUpdateUserPermissions.dto';
import { GetUsersWithPermissionQueryDto } from './dtos/getUsersWithPermissionQuery.dto';
import { PaginatedUsersResponseDto } from './dtos/paginatedUsersResponse.dto';
import { UserPermissionsService } from './user-permissions.service';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UserPermissionsController {
  constructor(private readonly permissionsService: UserPermissionsService) {}

  @Patch(':id/permissions')
  @Auth('canManageUsers')
  @ApiOperation({ summary: "Update a user's system permissions", operationId: 'updatePermissions' })
  @ApiResponse({
    status: 200,
    description: 'The user permissions have been successfully updated.',
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to manage users.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserPermissionsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<User> {
    return this.permissionsService.updatePermissions(id, body, request.user);
  }

  @Post('permissions')
  @Auth('canManageUsers')
  @ApiOperation({ summary: 'Bulk update user permissions', operationId: 'bulkUpdatePermissions' })
  @ApiResponse({
    status: 200,
    description: 'The user permissions have been successfully updated.',
    type: [User],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to manage users.',
  })
  async bulkUpdatePermissions(
    @Body() body: BulkUpdateUserPermissionsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<User[]> {
    return this.permissionsService.bulkUpdatePermissions(body, request.user);
  }

  @Get(':id/permissions')
  @Auth('canManageUsers')
  @ApiOperation({ summary: "Get a user's system permissions", operationId: 'getPermissions' })
  @ApiResponse({
    status: 200,
    description: "The user's permissions.",
    type: SystemPermissions,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to manage users.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async getPermissions(@Param('id', ParseIntPipe) id: number): Promise<SystemPermissions> {
    return this.permissionsService.getPermissions(id);
  }

  @Get('with-permission')
  @Auth('canManageUsers')
  @ApiOperation({ summary: 'Get users with a specific permission', operationId: 'getAllWithPermission' })
  @ApiResponse({
    status: 200,
    description: 'List of users with the specified permission.',
    type: PaginatedUsersResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to manage users.',
  })
  async getAllWithPermission(@Query() query: GetUsersWithPermissionQueryDto): Promise<PaginatedUsersResponseDto> {
    return this.permissionsService.getAllWithPermission(query);
  }
}
