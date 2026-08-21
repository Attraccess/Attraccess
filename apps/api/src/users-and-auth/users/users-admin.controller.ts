import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { User } from '@attraccess/database-entities';
import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { UsersService } from './users.service';
import { UserPasswordService } from './user-password.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { FindManyUsersQueryDto } from './dtos/findManyUsersQuery.dto';
import { PaginatedUserSummariesResponseDto, PaginatedUsersResponseDto } from './dtos/paginatedUsersResponse.dto';
import { SetUserPasswordDto } from './dtos/setUserPassword.dto';
import { ChangeUsernameDto } from './dtos/changeUsername.dto';
import { ChangeEmailDto } from './dtos/changeEmail.dto';
import { ChangeBillingFactorDto } from './dtos/changeBillingFactor.dto';
import { mapEmailSendError } from './email-send-error.util';
import { computeNextPage } from '../../types/response';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UsersAdminController {
  private readonly logger = new Logger(UsersAdminController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: UserPasswordService,
  ) {}

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
    description: 'Forbidden - includeRoles requires users.read permission.',
  })
  async findMany(
    @Query() query: FindManyUsersQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaginatedUserSummariesResponseDto | PaginatedUsersResponseDto> {
    const canReadUsers = request.user.effectivePermissions?.has('users.read') ?? false;

    // Role data is sensitive; only expose it to users.read holders.
    if (query.includeRoles && !canReadUsers) {
      throw new ForbiddenException();
    }
    const result = await this.usersService.findMany({
      page: query.page,
      limit: query.limit,
      search: query.search,
      ids: query.ids,
      includeRoles: query.includeRoles,
    });
    this.logger.debug(`Found ${result.total} users total, returning ${result.data.length} users`);
    return {
      ...result,
      data: canReadUsers ? result.data : result.data.map(({ id, username }) => ({ id, username })),
      nextPage: computeNextPage(result.page, result.limit, result.total),
    };
  }

  @Post(':id/password')
  @Auth()
  @ApiOperation({ summary: "Set a user's password directly", operationId: 'setUserPassword' })
  @ApiResponse({
    status: 200,
    description: 'The password has been successfully updated.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password updated successfully' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async setUserPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetUserPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.passwordService.setUserPassword(id, body, request.user);
    return { message: 'Password updated successfully' };
  }

  @Patch(':id/username')
  @Auth('users.update')
  @ApiOperation({ summary: "Admin: Change a user's username (no limit)", operationId: 'changeUserUsername' })
  @ApiResponse({ status: 200, description: 'Username changed.', type: User })
  async changeUserUsername(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeUsernameDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<User> {
    return await this.usersService.changeUsername(id, body.username, request.user);
  }

  @Patch(':id/email')
  @Auth('users.update')
  @ApiOperation({ summary: "Admin: Change a user's email address", operationId: 'changeUserEmail' })
  @ApiResponse({ status: 200, description: 'Email changed.', type: User })
  async changeUserEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeEmailDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<User> {
    try {
      return await this.usersService.changeEmail(id, body.email, request.user);
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }

  @Patch(':id/billing-factor')
  @Auth('billing.manage')
  @ApiOperation({ summary: "Change a user's billing factor", operationId: 'changeUserBillingFactor' })
  @ApiResponse({ status: 200, description: 'Billing factor changed.', type: User })
  async changeUserBillingFactor(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeBillingFactorDto,
  ): Promise<User> {
    return await this.usersService.changeBillingFactor(id, body.billingFactor);
  }
}
