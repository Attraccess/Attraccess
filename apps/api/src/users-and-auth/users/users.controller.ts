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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ServiceUnavailableException,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { FindManyUsersQueryDto } from './dtos/findManyUsersQuery.dto';
import { VerifyEmailDto } from './dtos/verifyEmail.dto';
import {
  AuthenticationDetail,
  User,
  SystemPermissions,
  Setting,
  AuthenticationType,
  SSOProviderType,
} from '@attraccess/database-entities';
import { ApiTags, ApiResponse, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
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
import { ChangeEmailDto } from './dtos/changeEmail.dto';
import { ChangeBillingFactorDto } from './dtos/changeBillingFactor.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';
import { BooleanDto } from '../../types/boolean.dto';
import { InviteUserDto } from './dtos/inviteUser.dto';
import { AcceptInvitationDto } from './dtos/acceptInvitation.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CsvInviteConfigDto,
  CsvInviteErrorResponseDto,
  CsvInviteRowErrorDto,
  CsvInviteUploadDto,
} from './dtos/csvInvite.dto';
import { parse as parseCsv, type Info as CsvInfo } from 'csv-parse';
import { Readable } from 'stream';
import { plainToInstance } from 'class-transformer';
import { validate, isEmail } from 'class-validator';
import { FileUpload } from '../../common/types/file-upload.types';
import { EntityManager } from 'typeorm';
import { DeleteAccountConfirmDto } from './dtos/deleteAccountConfirm.dto';
import { SSOService } from '../auth/sso/sso.service';
import { hasConfiguredPermissionMapping } from '../auth/sso/permission-mapping';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly ssoService: SSOService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) { }

  private mapEmailSendError(error: unknown): never {
    const code = (error as { code?: string })?.code;
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
      throw new ServiceUnavailableException('EmailSendFailed');
    }
    throw error;
  }

  private async isPermissionsManagedBySso(user: User): Promise<boolean> {
    const authenticationDetails = user.authenticationDetails ?? [];
    const ssoDetails = authenticationDetails.filter(
      (detail) => detail.type === AuthenticationType.SSO && detail.providerId && detail.providerType,
    );

    if (ssoDetails.length === 0) {
      return false;
    }

    for (const detail of ssoDetails) {
      const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(
        detail.providerType as SSOProviderType,
        detail.providerId as number,
      );

      if (!provider) {
        continue;
      }

      const permissionMappings =
        detail.providerType === SSOProviderType.OIDC
          ? provider.oidcConfiguration?.permissionMappings
          : provider.samlConfiguration?.permissionMappings;

      if (hasConfiguredPermissionMapping(permissionMappings)) {
        return true;
      }
    }

    return false;
  }

  private async ensurePermissionsNotManagedBySso(user: User): Promise<void> {
    if (await this.isPermissionsManagedBySso(user)) {
      this.logger.warn(`Permissions update blocked for SSO-managed user ID: ${user.id}`);
      throw new ForbiddenException('UserPermissionsManagedBySSO');
    }
  }

  private async inviteUsersTransactional(
    candidates: Array<{ username: string; email: string; systemPermissions: Partial<SystemPermissions> }>,
    options?: { grantAllPermissionsToFirst?: boolean },
  ): Promise<User[]> {
    await this.usersService.ensureLicenseForNewUsers(candidates.length);

    return this.usersService
      .withTransaction(async (manager: EntityManager) => {
        const createdUsers = await this.usersService.createMany(candidates, {
          grantAllPermissionsToFirst: options?.grantAllPermissionsToFirst ?? false,
          manager,
        });

        for (const user of createdUsers) {
          const verificationToken = await this.authService.generateEmailVerificationToken(user, manager);
          await this.emailService.sendUserInvitationEmail(user, verificationToken, manager);
        }

        return createdUsers;
      })
      .catch((error) => this.mapEmailSendError(error));
  }

  public async parseCsvFile(
    file: FileUpload | undefined,
    config: CsvInviteConfigDto,
  ): Promise<{
    candidates: Array<{ username: string; email: string; systemPermissions: Partial<SystemPermissions>; row: number }>;
    errors: CsvInviteRowErrorDto[];
    emailRowMap: Map<string, number[]>;
    usernameRowMap: Map<string, number[]>;
  }> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    const inputStream = file.buffer ? Readable.from(file.buffer) : undefined;
    if (!inputStream) {
      throw new BadRequestException('Unable to read CSV file');
    }

    const parser = parseCsv({
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: false,
      trim: true,
    });

    const normalizeColumns = (columns: CsvInfo['columns'] | undefined): string[] | null => {
      if (!columns || typeof columns === 'boolean') {
        return null;
      }

      return columns
        .map((column) => (typeof column === 'string' ? column : (column?.name ?? '')))
        .filter((value) => value !== '');
    };

    let header: string[] | null = null;
    const candidates: Array<{
      username: string;
      email: string;
      systemPermissions: Partial<SystemPermissions>;
      row: number;
    }> = [];
    const errors: CsvInviteRowErrorDto[] = [];
    const ignoredRows = new Set(config.ignoredRows ?? []);
    const seenEmails = new Set<string>();
    const seenUsernames = new Set<string>();
    const emailRowMap = new Map<string, number[]>();
    const usernameRowMap = new Map<string, number[]>();

    let dataRowIndex = 0;

    try {
      for await (const record of inputStream.pipe(parser)) {
        header = header ?? normalizeColumns(parser.info?.columns) ?? Object.keys(record ?? {});

        dataRowIndex += 1;
        const rowNumber = dataRowIndex;

        if (ignoredRows.has(rowNumber)) {
          continue;
        }

        const rowData: Record<string, string> = {};
        (header ?? []).forEach((headerLabel) => {
          const rawValue = record?.[headerLabel];
          rowData[headerLabel] = rawValue == null ? '' : String(rawValue).trim();
        });

        const isEmptyRow = Object.values(rowData).every((value) => value === '');
        if (isEmptyRow) {
          errors.push({ row: rowNumber, message: 'Row is empty' });
          continue;
        }

        const rowErrors: CsvInviteRowErrorDto[] = [];

        const email = (rowData[config.emailKey] ?? '').trim();
        if (!email) {
          rowErrors.push({ row: rowNumber, field: 'email', message: 'REQUIRED' });
        } else if (!isEmail(email)) {
          rowErrors.push({ row: rowNumber, field: 'email', message: 'INVALID', value: email });
        }

        const usernameOriginal = (rowData[config.usernameKey] ?? '').trim();
        let normalizedUsername = '';
        if (!usernameOriginal) {
          rowErrors.push({ row: rowNumber, field: 'username', message: 'REQUIRED' });
        } else {
          normalizedUsername = this.usersService.cleanupUsername(usernameOriginal);
          try {
            this.usersService.validateUsernameOrThrow(normalizedUsername);
          } catch (error) {
            rowErrors.push({
              row: rowNumber,
              field: 'username',
              message: (error as Error).message ?? 'INVALID',
              value: usernameOriginal,
            });
          }
        }

        const emailKey = email.toLowerCase();
        if (email && seenEmails.has(emailKey)) {
          rowErrors.push({ row: rowNumber, field: 'email', message: 'DUPLICATE_IN_CSV', value: email });
        } else if (email) {
          seenEmails.add(emailKey);
          emailRowMap.set(emailKey, [...(emailRowMap.get(emailKey) ?? []), rowNumber]);
        }

        if (normalizedUsername && seenUsernames.has(normalizedUsername)) {
          rowErrors.push({
            row: rowNumber,
            field: 'username',
            message: 'DUPLICATE_IN_CSV',
            value: normalizedUsername,
          });
        } else if (normalizedUsername) {
          seenUsernames.add(normalizedUsername);
          usernameRowMap.set(normalizedUsername, [...(usernameRowMap.get(normalizedUsername) ?? []), rowNumber]);
        }

        const systemPermissions: Partial<SystemPermissions> = {};
        (
          Object.entries(config.permissions ?? {}) as [
            keyof SystemPermissions,
            { keyMapping: string; yesValue: string },
          ][]
        )
          .filter(([, mapping]) => !!mapping?.keyMapping)
          .forEach(([permissionKey, mapping]) => {
            const value = (rowData[mapping.keyMapping] ?? '').trim();
            if (value === mapping.yesValue) {
              systemPermissions[permissionKey] = true;
            }
          });

        if (rowErrors.length) {
          errors.push(...rowErrors);
          continue;
        }

        candidates.push({
          username: normalizedUsername,
          email,
          systemPermissions,
          row: rowNumber,
        });
      }
    } catch (error) {
      this.logger.error('Failed to parse CSV', error as Error);
      throw new BadRequestException('Invalid CSV file');
    }

    header = header ?? normalizeColumns(parser.info?.columns);
    if (!header || header.every((value) => `${value}`.trim() === '')) {
      throw new BadRequestException('MISSING_HEADER_ROW');
    }

    const requiredColumns = new Set([config.emailKey, config.usernameKey]);

    requiredColumns.forEach((column) => {
      if (column && !header?.includes(column)) {
        errors.push({ row: 0, field: column, message: 'REQUIRED' });
      }
    });

    return { candidates, errors, emailRowMap, usernameRowMap };
  }

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

  @Get('local-signup-domain-whitelist')
  @Auth('canManageUsers', 'canManageSystemConfiguration')
  @ApiOperation({ summary: 'Get the local signup domain whitelist', operationId: 'getLocalSignupDomainWhitelist' })
  @ApiResponse({
    status: 200,
    description: 'The local signup domain whitelist.',
    type: [String],
  })
  public async getLocalSignupDomainWhitelist(): Promise<string[]> {
    const localSignupDomainWhitelist = await this.settingRepository.findOne({
      where: {
        parent: 'auth',
        key: 'local_signup_domain_whitelist',
      },
    });

    return (localSignupDomainWhitelist?.value ?? '*')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain !== '');
  }

  @Post('local-signup-domain-whitelist')
  @Auth('canManageUsers', 'canManageSystemConfiguration')
  @ApiOperation({ summary: 'Set the local signup domain whitelist', operationId: 'setLocalSignupDomainWhitelist' })
  @ApiResponse({
    status: 200,
    description: 'The local signup domain whitelist has been successfully set.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async setLocalSignupDomainWhitelist(@Body() body: string[]): Promise<void> {
    await this.settingRepository.update(
      {
        parent: 'auth',
        key: 'local_signup_domain_whitelist',
      },
      { value: body.join(',') },
    );
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

    const signupDomainWhitelist = await this.getLocalSignupDomainWhitelist();

    if (!signupDomainWhitelist.includes('*')) {
      const emailDomain = body.email.split('@').pop().toLowerCase();

      if (!signupDomainWhitelist.includes(emailDomain)) {
        throw new ForbiddenSignupDomainException(emailDomain);
      }
    }

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

  @Post('/invite')
  @ApiOperation({ summary: 'Invite a new user', operationId: 'inviteUser' })
  @ApiResponse({
    status: 200,
    description: 'The user has been successfully invited.',
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  @Auth('canManageUsers')
  async inviteUser(@Body() body: InviteUserDto): Promise<User> {
    try {
      const [invited] = await this.inviteUsersTransactional(
        [
          {
            username: body.username,
            email: body.email,
            systemPermissions: {},
          },
        ],
        { grantAllPermissionsToFirst: true },
      );

      return invited;
    } catch (error) {
      throw this.mapEmailSendError(error);
    }
  }

  @Post('/invite-csv')
  @Auth('canManageUsers')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Invite multiple users from a CSV file', operationId: 'inviteUsersFromCsv' })
  @ApiBody({ type: CsvInviteUploadDto })
  @ApiResponse({
    status: 200,
    description: 'Users have been successfully invited.',
    type: User,
    isArray: true,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid CSV or input data.',
    type: CsvInviteErrorResponseDto,
  })
  async inviteUsersFromCsv(
    @UploadedFile() file: FileUpload | undefined,
    @Body('config') rawConfig: string | CsvInviteConfigDto,
  ): Promise<User[]> {
    let configPayload: CsvInviteConfigDto | string;
    try {
      configPayload = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    } catch {
      throw new BadRequestException('Invalid config payload');
    }
    const config = plainToInstance(CsvInviteConfigDto, configPayload);
    const validationErrors = await validate(config, { whitelist: true, forbidNonWhitelisted: true });
    if (validationErrors.length) {
      throw new BadRequestException(validationErrors);
    }

    const { candidates, errors, emailRowMap, usernameRowMap } = await this.parseCsvFile(file, config);
    if (errors.length) {
      throw new BadRequestException({
        message: 'INVALID_CSV',
        errors,
      });
    }

    if (candidates.length === 0) {
      throw new BadRequestException({
        message: 'NO_CANDIDATES_IN_CSV',
        errors: [{ row: 0, message: 'NO_VALID_ROWS_FOUND_IN_CSV' }],
      });
    }

    const existingUsers = await this.usersService.findByEmailsOrUsernames(
      candidates.map((candidate) => candidate.email),
      candidates.map((candidate) => candidate.username),
    );

    const duplicateErrors: CsvInviteRowErrorDto[] = [];
    existingUsers.forEach((user) => {
      const emailRows = emailRowMap.get(user.email.trim().toLowerCase());
      if (emailRows?.length) {
        emailRows.forEach((row) =>
          duplicateErrors.push({ row, field: 'email', message: 'DUPLICATE_IN_DB', value: user.email }),
        );
      }

      const usernameRows = usernameRowMap.get(user.username.trim().toLowerCase());
      if (usernameRows?.length) {
        usernameRows.forEach((row) =>
          duplicateErrors.push({ row, field: 'username', message: 'DUPLICATE_IN_DB', value: user.username }),
        );
      }
    });

    if (duplicateErrors.length) {
      throw new BadRequestException({
        message: 'DUPLICATE_IN_DB',
        errors: duplicateErrors,
      });
    }

    try {
      const invitedUsers = await this.inviteUsersTransactional(candidates, { grantAllPermissionsToFirst: true });
      return invitedUsers;
    } catch (error) {
      throw this.mapEmailSendError(error);
    }
  }

  @Get('local-signup-enabled')
  @ApiOperation({ summary: 'Check if local signup is enabled', operationId: 'isLocalSignupEnabled' })
  @ApiResponse({
    status: 200,
    description: 'Local signup is enabled.',
    type: BooleanDto,
  })
  async isLocalSignupEnabled(): Promise<BooleanDto> {
    const whitelist = await this.getLocalSignupDomainWhitelist();
    return { value: whitelist.length > 0 };
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

  @Post('accept-invitation')
  @ApiOperation({ summary: 'Accept a user invitation', operationId: 'acceptInvitation' })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted successfully.',
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async acceptInvitation(@Body() body: AcceptInvitationDto): Promise<User> {
    this.logger.debug(`Accepting invitation for: ${body.email} with token: ${body.token.substring(0, 5)}...`);

    await this.authService.verifyEmail(body.email, body.token);

    const user = await this.usersService.findOne({ email: body.email });

    await this.authService.addAuthenticationDetails(user.id, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: {
        password: body.password,
      },
    });
    this.logger.debug(`Invitation accepted successfully for: ${body.email}`);
    return user;
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

    const isSSOUser = await this.usersService.isSSOUser(user.id);
    if (isSSOUser) {
      throw new ForbiddenException('You cannot reset the password of an SSO user');
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

    const isSSOUser = await this.usersService.isSSOUser(userId);
    if (isSSOUser) {
      throw new ForbiddenException('You cannot reset the password of an SSO user');
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
  @Post('me/delete-request')
  @ApiOperation({ summary: 'Request account deletion email', operationId: 'requestDeleteAccount' })
  @ApiResponse({
    status: 200,
    description: 'Delete account confirmation email sent.',
  })
  async requestDeleteAccount(@Req() request: AuthenticatedRequest): Promise<void> {
    try {
      await this.usersService.requestSelfDeletion(request.user.id);
    } catch (error) {
      throw this.mapEmailSendError(error);
    }
  }

  @Post('me/delete-confirm')
  @ApiOperation({ summary: 'Confirm account deletion via email token', operationId: 'confirmDeleteAccount' })
  @ApiResponse({
    status: 200,
    description: 'Account deleted.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async confirmDeleteAccount(@Body() body: DeleteAccountConfirmDto): Promise<void> {
    await this.usersService.confirmSelfDeletion(body.email, body.token);
  }

  @Auth()
  @Patch('me/username')
  @ApiOperation({ summary: 'Change current user username (limit once per day)', operationId: 'changeMyUsername' })
  @ApiResponse({ status: 200, description: 'Username changed.', type: User })
  async changeMyUsername(@Req() request: AuthenticatedRequest, @Body() body: ChangeUsernameDto): Promise<User> {
    return await this.usersService.changeUsername(request.user.id, body.username, request.user);
  }

  @Auth()
  @Patch('me/email')
  @ApiOperation({ summary: 'Change current user email address', operationId: 'changeMyEmail' })
  @ApiResponse({ status: 200, description: 'Email changed.', type: User })
  async changeMyEmail(@Req() request: AuthenticatedRequest, @Body() body: ChangeEmailDto): Promise<User> {
    try {
      return await this.usersService.changeEmail(request.user.id, body.email, request.user);
    } catch (error) {
      throw this.mapEmailSendError(error);
    }
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
  @Auth('canManageUsers')
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
    @Req() request: AuthenticatedRequest,
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
    const user = await this.usersService.findOne({ id }, ['authenticationDetails']);
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    await this.ensurePermissionsNotManagedBySso(user);

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
    @Req() request: AuthenticatedRequest,
  ): Promise<User[]> {
    this.logger.debug(`Bulk updating permissions for ${body.updates.length} users, by user ID: ${request.user.id}`);

    // First, validate that the user is not trying to grant permissions they don't have
    for (const update of body.updates) {
      this.validateCanGrantPermissions(request.user, update.permissions);
    }

    const updatedUsers: User[] = [];
    const updateCandidates: Array<{ update: BulkUpdateUserPermissionsDto['updates'][number]; user: User }> = [];

    for (const update of body.updates) {
      // Skip if user is trying to update their own permissions
      if (request.user.id === update.userId) {
        this.logger.warn(`User ${update.userId} attempted to update their own permissions in bulk operation, skipping`);
        continue;
      }

      const user = await this.usersService.findOne({ id: update.userId }, ['authenticationDetails']);
      if (!user) {
        this.logger.debug(`User not found with ID: ${update.userId}, skipping`);
        continue;
      }

      await this.ensurePermissionsNotManagedBySso(user);
      updateCandidates.push({ update, user });
    }

    for (const { update, user } of updateCandidates) {
      try {
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
          `Applying permission updates for user ID: ${update.userId}: ${JSON.stringify(updates.systemPermissions)}`,
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
      `Found ${result.total} users with permission ${permission}, returning ${result.data.length} users`,
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
    @Req() request: AuthenticatedRequest,
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
    @Req() request: AuthenticatedRequest,
  ): Promise<User> {
    return await this.usersService.changeUsername(id, body.username, request.user);
  }

  @Patch(':id/email')
  @Auth('canManageUsers')
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
      throw this.mapEmailSendError(error);
    }
  }

  @Patch(':id/billing-factor')
  @Auth('canManageBilling')
  @ApiOperation({ summary: "Change a user's billing factor", operationId: 'changeUserBillingFactor' })
  @ApiResponse({ status: 200, description: 'Billing factor changed.', type: User })
  async changeUserBillingFactor(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeBillingFactorDto,
  ): Promise<User> {
    return await this.usersService.changeBillingFactor(id, body.billingFactor);
  }
}
