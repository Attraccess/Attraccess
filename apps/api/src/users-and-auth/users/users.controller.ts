import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Body,
  Inject,
  forwardRef,
  Query,
  ParseIntPipe,
  Logger,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { FindManyUsersQueryDto } from './dtos/findManyUsersQuery.dto';
import { VerifyEmailDto } from './dtos/verifyEmail.dto';
import { AuthenticationDetail, User, SystemPermissions } from '@attraccess/database-entities';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { CreateUserDto } from './dtos/createUser.dto';
import { PaginatedUsersResponseDto } from './dtos/paginatedUsersResponse.dto';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { UpdateUserPermissionsDto } from './dtos/updateUserPermissions.dto';
import { BulkUpdateUserPermissionsDto } from './dtos/bulkUpdateUserPermissions.dto';
import { GetUsersWithPermissionQueryDto, PermissionFilter } from './dtos/getUsersWithPermissionQuery.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { SetUserPasswordDto } from './dtos/setUserPassword.dto';
import { ChangeUsernameDto } from './dtos/changeUsername.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService
  ) {}

  /**
   * Validates that a user can grant the specified permissions
   * @param user The user attempting to grant permissions
   * @param permissions The permissions being granted
   * @throws ForbiddenException if the user tries to grant a permission they don't have
   */
  private validateCanGrantPermissions(user: User, permissions: Partial<SystemPermissions>): void {
    for (const permission of Object.keys(permissions)) {
      // If the permission is being set to true, check if the user has it
      if (permissions[permission] === true && !user.systemPermissions[permission]) {
        this.logger.warn(`User ${user.id} attempted to grant ${permission} permission they don't have`);
        throw new ForbiddenException('You cannot grant permissions you do not have');
      }
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user', operationId: 'createOneUser' })
  @ApiResponse({
    status: 201,
    description: 'The user has been successfully created.',
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async createOne(@Body() body: CreateUserDto): Promise<User> {
    this.logger.debug(`Creating new user with username: ${body.username} and email: ${body.email}`);

    const user = await this.usersService.createOne({
      username: body.username,
      email: body.email,
      externalIdentifier: null,
    });
    this.logger.debug(`User created with ID: ${user.id}`);

    let authenticationDetails: AuthenticationDetail | null = null;
    try {
      this.logger.debug(`Adding authentication details for user ID: ${user.id}, strategy: ${body.strategy}`);
      authenticationDetails = await this.authService.addAuthenticationDetails(user.id, {
        type: body.strategy,
        details: {
          password: body.password,
        },
      });
      this.logger.debug(`Authentication details added with ID: ${authenticationDetails.id}`);
    } catch (e) {
      this.logger.error(`Error adding authentication details for user ID: ${user.id}`, e.stack);
      await this.usersService.deleteOne(user.id);
      throw e;
    }

    try {
      this.logger.debug(`Generating email verification token for user ID: ${user.id}`);
      const verificationToken = await this.authService.generateEmailVerificationToken(user);
      this.logger.debug(`Sending verification email to user ID: ${user.id}`);
      await this.emailService.sendVerificationEmail(user, verificationToken);
      this.logger.debug(`Verification email sent to user ID: ${user.id}`);
    } catch (e) {
      this.logger.error(`Error sending verification email for user ID: ${user.id}`, e.stack);
      if (authenticationDetails) {
        await this.authService.removeAuthenticationDetails(authenticationDetails.id);
      }
      await this.usersService.deleteOne(user.id);
      throw e;
    }

    this.logger.debug(`User creation completed successfully for ID: ${user.id}`);
    return user;
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify a user email address', operationId: 'verifyEmail' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Email verified successfully' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or email.',
  })
  async verifyEmail(@Body() body: VerifyEmailDto) {
    this.logger.debug(`Verifying email for: ${body.email} with token: ${body.token.substring(0, 5)}...`);
    await this.authService.verifyEmail(body.email, body.token);
    this.logger.debug(`Email verified successfully for: ${body.email}`);
    return { message: 'Email verified successfully' };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Request a password reset', operationId: 'requestPasswordReset' })
  @ApiResponse({
    status: 200,
    description: 'OK',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async requestPasswordReset(@Body() body: ResetPasswordDto) {
    this.logger.debug(`Resetting password for: ${body.email}`);

    const token = await this.authService.generatePasswordResetToken(body.email);
    if (!token) {
      this.logger.debug(`No user found with email: ${body.email}`);

      return { message: 'OK' };
    }

    const user = await this.usersService.findOne({ email: body.email });
    if (!user) {
      this.logger.debug(`No user found with email: ${body.email}`);

      return { message: 'OK' };
    }

    await this.emailService.sendPasswordResetEmail(user, token);
    this.logger.debug(`Password reset e-mail sent to: ${body.email}`);

    return { message: 'OK' };
  }

  @Post('/:userId/change-password-by-token')
  @ApiOperation({ summary: 'Change a user password after password reset', operationId: 'changePasswordViaResetToken' })
  @ApiResponse({
    status: 200,
    description: 'OK',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async changePasswordViaResetToken(@Param('userId', ParseIntPipe) userId: number, @Body() body: ChangePasswordDto) {
    this.logger.debug(`Changing password for user ID: ${userId}`);

    const user = await this.usersService.findOne({ id: userId });
    if (!user) {
      this.logger.debug(`User not found with ID: ${userId}`);
      throw new UserNotFoundException(userId);
    }

    if (user.passwordResetToken !== body.token) {
      this.logger.debug(`Invalid token for user ID: ${userId}`);
      throw new ForbiddenException('Invalid token');
    }

    await this.authService.changePassword(user, body.password);

    await this.usersService.updateOne(userId, {
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    });

    return { message: 'OK' };
  }

  @Auth()
  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user', operationId: 'getCurrent' })
  @ApiResponse({
    status: 200,
    description: 'The current user.',
    type: User,
  })
  @ApiResponse({
    status: 401,
    description: 'User is not authenticated.',
  })
  async getCurrent(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @Auth()
  @Patch('me/username')
  @ApiOperation({ summary: 'Change current user username (limit once per day)', operationId: 'changeMyUsername' })
  @ApiResponse({ status: 200, description: 'Username changed.', type: User })
  async changeMyUsername(@Req() request: AuthenticatedRequest, @Body() body: ChangeUsernameDto): Promise<User> {
    return await this.usersService.changeUsername(request.user.id, body.username, request.user);
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

    // Allow access if the user is requesting their own data or has canManageUsers permission
    if (authenticatedUser?.id !== id && !authenticatedUser.systemPermissions.canManageUsers) {
      this.logger.debug(
        `Access denied - User ID ${authenticatedUser.id} attempting to access user ID ${id} without required permissions`
      );
      throw new ForbiddenException();
    }

    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    return user;
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get a paginated list of users', operationId: 'findMany' })
  @ApiResponse({
    status: 200,
    description: 'List of users.',
    type: PaginatedUsersResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to manage users.',
  })
  async findMany(@Query() query: FindManyUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const result = (await this.usersService.findMany({
      page: query.page,
      limit: query.limit,
      search: query.search,
      ids: query.ids,
    })) as PaginatedUsersResponseDto;
    this.logger.debug(`Found ${result.total} users total, returning ${result.data.length} users`);
    return result;
  }

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
    @Req() request: AuthenticatedRequest
  ): Promise<User> {
    this.logger.debug(`Updating permissions for user ID: ${id}, by user ID: ${request.user.id}`);

    // Prevent users from updating their own permissions
    if (request.user.id === id) {
      this.logger.warn(`User ${id} attempted to update their own permissions`);
      throw new ForbiddenException('You cannot update your own permissions');
    }

    // Validate the user can grant the requested permissions
    this.validateCanGrantPermissions(request.user, body);

    // Get the user to update
    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    // Create an update object with just the systemPermissions
    const updates: Partial<User> = {
      systemPermissions: {
        ...user.systemPermissions,
      },
    };

    // Update only the permissions that were specified in the request
    if (body.canManageResources !== undefined) {
      updates.systemPermissions.canManageResources = body.canManageResources;
    }

    if (body.canManageSystemConfiguration !== undefined) {
      updates.systemPermissions.canManageSystemConfiguration = body.canManageSystemConfiguration;
    }

    if (body.canManageUsers !== undefined) {
      updates.systemPermissions.canManageUsers = body.canManageUsers;
    }

    this.logger.debug(`Applying permission updates for user ID: ${id}: ${JSON.stringify(updates.systemPermissions)}`);

    // Update the user
    const updatedUser = await this.usersService.updateOne(id, updates);
    this.logger.debug(`Successfully updated permissions for user ID: ${id}`);

    return updatedUser;
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
    @Req() request: AuthenticatedRequest
  ): Promise<User[]> {
    this.logger.debug(`Bulk updating permissions for ${body.updates.length} users, by user ID: ${request.user.id}`);

    // First, validate that the user is not trying to grant permissions they don't have
    for (const update of body.updates) {
      this.validateCanGrantPermissions(request.user, update.permissions);
    }

    const updatedUsers: User[] = [];

    for (const update of body.updates) {
      // Skip if user is trying to update their own permissions
      if (request.user.id === update.userId) {
        this.logger.warn(`User ${update.userId} attempted to update their own permissions in bulk operation, skipping`);
        continue;
      }

      try {
        // Get the user to update
        const user = await this.usersService.findOne({ id: update.userId });
        if (!user) {
          this.logger.debug(`User not found with ID: ${update.userId}, skipping`);
          continue;
        }

        // Create an update object with just the systemPermissions
        const updates: Partial<User> = {
          systemPermissions: {
            ...user.systemPermissions,
          },
        };

        // Update only the permissions that were specified in the request
        if (update.permissions.canManageResources !== undefined) {
          updates.systemPermissions.canManageResources = update.permissions.canManageResources;
        }

        if (update.permissions.canManageSystemConfiguration !== undefined) {
          updates.systemPermissions.canManageSystemConfiguration = update.permissions.canManageSystemConfiguration;
        }

        if (update.permissions.canManageUsers !== undefined) {
          updates.systemPermissions.canManageUsers = update.permissions.canManageUsers;
        }

        this.logger.debug(
          `Applying permission updates for user ID: ${update.userId}: ${JSON.stringify(updates.systemPermissions)}`
        );

        // Update the user
        const updatedUser = await this.usersService.updateOne(update.userId, updates);
        this.logger.debug(`Successfully updated permissions for user ID: ${update.userId}`);

        updatedUsers.push(updatedUser);
      } catch (error) {
        this.logger.error(`Error updating user ID: ${update.userId}: ${error.message}`);
        // Continue with the next user even if there's an error
      }
    }

    this.logger.debug(`Successfully updated ${updatedUsers.length} users`);
    return updatedUsers;
  }

  @Get(':id/permissions')
  @Auth('canManageUsers')
  @ApiOperation({ summary: "Get a user's system permissions", operationId: 'getPermissions' })
  @ApiResponse({
    status: 200,
    description: "The user's permissions.",
    schema: {
      type: 'object',
      properties: {
        canManageResources: { type: 'boolean' },
        canManageSystemConfiguration: { type: 'boolean' },
        canManageUsers: { type: 'boolean' },
      },
    },
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
    this.logger.debug(`Getting permissions for user ID: ${id}`);

    // Get the user
    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    this.logger.debug(`Returning permissions for user ID: ${id}`);
    return user.systemPermissions;
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
    const permission = query.permission || PermissionFilter.canManageUsers;

    this.logger.debug(`Getting users with permission: ${permission}, page: ${query.page}, limit: ${query.limit}`);

    const result = (await this.usersService.findByPermission(permission, {
      page: query.page,
      limit: query.limit,
    })) as PaginatedUsersResponseDto;

    this.logger.debug(
      `Found ${result.total} users with permission ${permission}, returning ${result.data.length} users`
    );

    return result;
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
    @Req() request: AuthenticatedRequest
  ): Promise<{ message: string }> {
    this.logger.debug(`Setting password for user ID: ${id}, by user ID: ${request.user.id}`);

    // Prevent users from updating their own password through this endpoint
    if (request.user.id !== id && !request.user.systemPermissions.canManageUsers) {
      this.logger.warn(`User ${id} attempted to change password of another user without permission`);
      throw new ForbiddenException('You cannot change password of another user without permission');
    }

    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    await this.authService.changePassword(user, body.password);

    this.logger.debug(`Password successfully updated for user ID: ${id}`);
    return { message: 'Password updated successfully' };
  }

  @Patch(':id/username')
  @Auth('canManageUsers')
  @ApiOperation({ summary: "Admin: Change a user's username (no limit)", operationId: 'changeUserUsername' })
  @ApiResponse({ status: 200, description: 'Username changed.', type: User })
  async changeUserUsername(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeUsernameDto,
    @Req() request: AuthenticatedRequest
  ): Promise<User> {
    return await this.usersService.changeUsername(id, body.username, request.user);
  }
}
