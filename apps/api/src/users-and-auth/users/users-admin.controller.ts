import { User } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Optional,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { computeNextPage } from '../../types/response';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { FindManyUsersQueryDto } from './dtos/findManyUsersQuery.dto';
import { PaginatedUserSummariesResponseDto, PaginatedUsersResponseDto } from './dtos/paginatedUsersResponse.dto';
import { UserPasswordService } from './user-password.service';
import { UsersAdminProfileRoutes } from './users-admin-profile.routes';
import { UsersService } from './users.service';
import { installInheritedMethods } from '../../common/inherited-implementation';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UsersAdminController extends UsersAdminProfileRoutes {
  protected readonly logger = new Logger(UsersAdminController.name);

  constructor(
    protected readonly usersService: UsersService,
    protected readonly passwordService: UserPasswordService,
    @Optional() protected readonly identityAudit?: IdentityAuditService,
  ) {
    super();
  }

  @Auth()
  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID', operationId: 'getOneUserById' })
  @ApiResponse({
    status: 200,
    description: 'The user with the specified ID.',
    type: User,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to access this resource.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    type: UserNotFoundException,
  })
  async getOneById(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest): Promise<User> {
    const authenticatedUser = request.user;

    // Allow access if the user is requesting their own data or has users.read permission
    if (authenticatedUser?.id !== id && !authenticatedUser.effectivePermissions?.has('users.read')) {
      this.logger.debug(
        `Access denied - User ID ${authenticatedUser.id} attempting to access user ID ${id} without required permissions`,
      );
      throw new ForbiddenException();
    }

    const user = await this.usersService.findOne({ id }, ['authenticationDetails']);
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    return user;
  }

  @Delete(':id')
  @Auth('users.delete')
  @ApiOperation({ summary: 'Delete a user', operationId: 'deleteUser' })
  @ApiResponse({
    status: 200,
    description: 'User deleted.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to delete users.',
  })
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest): Promise<void> {
    if (request.user.id === id) {
      throw new BadRequestException('DeleteAccountUseSelfEndpoint');
    }

    await this.usersService.deleteOne(id);
    await this.record('user_deleted', id, request);
  }

  @Get()
  @Auth()
  @ApiExtraModels(PaginatedUserSummariesResponseDto, PaginatedUsersResponseDto)
  @ApiOperation({ summary: 'Get a paginated list of users', operationId: 'findMany' })
  @ApiResponse({
    status: 200,
    description: 'List of users.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(PaginatedUserSummariesResponseDto) },
        { $ref: getSchemaPath(PaginatedUsersResponseDto) },
      ],
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user filters and role data require users.read permission.',
  })
  async findMany(
    @Query() query: FindManyUsersQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaginatedUserSummariesResponseDto | PaginatedUsersResponseDto> {
    const canReadUsers = request.user.effectivePermissions?.has('users.read') ?? false;

    // User filter criteria and role data are sensitive; only expose them to users.read holders.
    if (
      (query.includeRoles ||
        query.roleId !== undefined ||
        query.roleIds !== undefined ||
        query.excludeRoleIds !== undefined ||
        query.emailVerified !== undefined ||
        query.ssoProviderIds !== undefined ||
        query.excludeSsoProviderIds !== undefined ||
        query.ssoProviderNone !== undefined ||
        query.hasSsoProvider !== undefined) &&
      !canReadUsers
    ) {
      throw new ForbiddenException();
    }
    const result = await this.usersService.findMany({
      page: query.page,
      limit: query.limit,
      search: query.search,
      ids: query.ids,
      roleId: query.roleId,
      roleIds: query.roleIds,
      excludeRoleIds: query.excludeRoleIds,
      roleMatch: query.roleMatch,
      emailVerified: query.emailVerified,
      ssoProviderIds: query.ssoProviderIds,
      excludeSsoProviderIds: query.excludeSsoProviderIds,
      ssoProviderNone: query.ssoProviderNone,
      hasSsoProvider: query.hasSsoProvider,
      ssoProviderMatch: query.ssoProviderMatch,
      includeRoles: query.includeRoles,
    });
    this.logger.debug(`Found ${result.total} users total, returning ${result.data.length} users`);
    return {
      ...result,
      data: canReadUsers ? result.data : result.data.map(({ id, username }) => ({ id, username })),
      nextPage: computeNextPage(result.page, result.limit, result.total),
    };
  }
}
installInheritedMethods(UsersAdminController, [
  'getOneById',
  'deleteOne',
  'findMany',
  'setUserPassword',
  'changeUserUsername',
  'changeUserEmail',
  'changeUserBillingFactor',
  'record',
]);
