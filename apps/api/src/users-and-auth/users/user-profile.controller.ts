import { Body, Controller, Get, Patch, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@attraccess/database-entities';
import { AuthenticatedRequest, AuthenticatedUser, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { AuthRateLimit } from '../rate-limiting/rate-limit.decorator';
import { UsersService } from './users.service';
import { ChangeUsernameDto } from './dtos/changeUsername.dto';
import { ChangeEmailDto } from './dtos/changeEmail.dto';
import { DeleteAccountConfirmDto } from './dtos/deleteAccountConfirm.dto';
import { UpdateLocaleDto } from './dtos/updateLocale.dto';
import { mapEmailSendError } from './email-send-error.util';
import { CurrentUserDto } from './dtos/current-user.dto';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UserProfileController {
  constructor(private readonly usersService: UsersService) {}

  @SessionAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user', operationId: 'getCurrent' })
  @ApiResponse({
    status: 200,
    description: 'The current user.',
    type: CurrentUserDto,
  })
  @ApiResponse({
    status: 401,
    description: 'User is not authenticated.',
  })
  async getCurrent(@Req() request: AuthenticatedRequest): Promise<CurrentUserDto> {
    const user = request.user as AuthenticatedUser;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      locale: user.locale,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      externalIdentifier: user.externalIdentifier,
      creditBalance: user.creditBalance,
      billingFactor: user.billingFactor,
      effectivePermissions: user.effectivePermissions ? [...user.effectivePermissions] : [],
    };
  }

  @SessionAuth()
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
      throw mapEmailSendError(error);
    }
  }

  @Post('me/delete-confirm')
  @AuthRateLimit('delete_account_confirm', { clearFailuresOnSuccess: false })
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

  @SessionAuth()
  @Patch('me/username')
  @ApiOperation({ summary: 'Change current user username (limit once per day)', operationId: 'changeMyUsername' })
  @ApiResponse({ status: 200, description: 'Username changed.', type: User })
  async changeMyUsername(@Req() request: AuthenticatedRequest, @Body() body: ChangeUsernameDto): Promise<User> {
    return await this.usersService.changeUsername(request.user.id, body.username, request.user);
  }

  @SessionAuth()
  @Patch('me/email')
  @ApiOperation({ summary: 'Change current user email address', operationId: 'changeMyEmail' })
  @ApiResponse({ status: 200, description: 'Email changed.', type: User })
  async changeMyEmail(@Req() request: AuthenticatedRequest, @Body() body: ChangeEmailDto): Promise<User> {
    try {
      return await this.usersService.changeEmail(request.user.id, body.email, request.user);
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }

  @SessionAuth()
  @Patch('me/locale')
  @ApiOperation({
    summary: 'Update preferred locale',
    operationId: 'updateMyLocale',
  })
  @ApiResponse({ status: 200, description: 'Locale updated.', type: User })
  async updateMyLocale(@Req() request: AuthenticatedRequest, @Body() body: UpdateLocaleDto): Promise<User> {
    return this.usersService.updateLocale(request.user.id, body.locale);
  }
}
