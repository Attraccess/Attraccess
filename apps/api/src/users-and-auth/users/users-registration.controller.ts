import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { AuthRateLimit } from '../rate-limiting/rate-limit.decorator';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { BooleanDto } from '../../types/boolean.dto';
import { CreateUserDto } from './dtos/createUser.dto';
import { UserDto, toUserAccountDto } from './dtos/user.dto';
import { VerifyEmailDto } from './dtos/verifyEmail.dto';
import { ChangeUnverifiedEmailDto } from './dtos/changeUnverifiedEmail.dto';
import { ResendVerificationEmailDto } from './dtos/resendVerificationEmail.dto';
import { AcceptInvitationDto } from './dtos/acceptInvitation.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { SignupDomainService } from './signup-domain.service';
import { UserRegistrationService } from './user-registration.service';
import { UserPasswordService } from './user-password.service';
import { UnverifiedEmailChangeService } from './unverified-email-change.service';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UsersRegistrationController {
  constructor(
    private readonly signupDomainService: SignupDomainService,
    private readonly registrationService: UserRegistrationService,
    private readonly passwordService: UserPasswordService,
    private readonly unverifiedEmailChangeService: UnverifiedEmailChangeService,
  ) {}

  @Get('local-signup-domain-whitelist')
  @Auth('system.settings.manage', 'users.create')
  @ApiOperation({ summary: 'Get the local signup domain whitelist', operationId: 'getLocalSignupDomainWhitelist' })
  @ApiResponse({
    status: 200,
    description: 'The local signup domain whitelist.',
    type: [String],
  })
  public async getLocalSignupDomainWhitelist(): Promise<string[]> {
    return this.signupDomainService.getWhitelist();
  }

  @Post('local-signup-domain-whitelist')
  @Auth('system.settings.manage', 'users.create')
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
    await this.signupDomainService.setWhitelist(body);
  }

  @Post()
  @AuthRateLimit('register')
  @ApiOperation({ summary: 'Create a new user', operationId: 'createOneUser' })
  @ApiResponse({
    status: 201,
    description: 'The user has been successfully created.',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  @ApiResponse({
    status: 403,
    description: 'First-time setup is already complete (only relevant when overwriteFirstTimeAdmin is true).',
  })
  @ApiResponse({
    status: 503,
    description: 'The account could not be created because the verification email could not be sent.',
  })
  async createOne(@Body() body: CreateUserDto, @Req() req: Request): Promise<UserDto> {
    const acceptLanguage = req.headers['accept-language'];
    const locale = (acceptLanguage?.split(',')[0]?.split(';')[0] ?? '').trim() || undefined;
    const userAgent = req.headers['user-agent'];
    return toUserAccountDto(await this.registrationService.createOne(body, locale, { ipAddress: req.ip, userAgent }));
  }

  @Get('local-signup-enabled')
  @ApiOperation({ summary: 'Check if local signup is enabled', operationId: 'isLocalSignupEnabled' })
  @ApiResponse({
    status: 200,
    description: 'Local signup is enabled.',
    type: BooleanDto,
  })
  async isLocalSignupEnabled(): Promise<BooleanDto> {
    return { value: await this.signupDomainService.isLocalSignupEnabled() };
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
    await this.registrationService.verifyEmail(body.email, body.token);
    return { message: 'Email verified successfully' };
  }

  @Post('resend-verification-email')
  @AuthRateLimit('verification_email_resend')
  @ApiOperation({ summary: 'Resend the email verification link', operationId: 'resendVerificationEmail' })
  @ApiResponse({
    status: 200,
    description: 'If the email exists and is not yet verified, a new verification email will be sent.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'OK' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async resendVerificationEmail(@Body() body: ResendVerificationEmailDto) {
    await this.registrationService.resendVerificationEmail(body.email);
    return { message: 'OK' };
  }

  @Post('change-unverified-email')
  @HttpCode(200)
  @AuthRateLimit('unverified_email_change')
  @ApiOperation({
    summary: 'Change the email address of an account that has not been verified yet',
    operationId: 'changeUnverifiedEmail',
  })
  @ApiResponse({
    status: 200,
    description: 'The email address was changed and a new verification email was sent to it.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'OK' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or the email is already in use.',
  })
  @ApiResponse({ status: 401, description: 'Unknown user or wrong password.' })
  @ApiResponse({
    status: 403,
    description: 'The account is already verified, or the domain of the new email is not allowed.',
  })
  @ApiResponse({ status: 429, description: 'Too many attempts.' })
  @ApiResponse({ status: 503, description: 'The verification email could not be sent.' })
  async changeUnverifiedEmail(@Body() body: ChangeUnverifiedEmailDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    await this.unverifiedEmailChangeService.changeUnverifiedEmail(body, { ipAddress: req.ip, userAgent });
    return { message: 'OK' };
  }

  @Post('accept-invitation')
  @ApiOperation({ summary: 'Accept a user invitation', operationId: 'acceptInvitation' })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted successfully.',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  async acceptInvitation(@Body() body: AcceptInvitationDto): Promise<UserDto> {
    return toUserAccountDto(await this.registrationService.acceptInvitation(body));
  }

  @Post('reset-password')
  @AuthRateLimit('password_reset_request')
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
    await this.passwordService.requestPasswordReset(body.email);
    return { message: 'OK' };
  }

  @Post('/:userId/change-password-by-token')
  @AuthRateLimit('password_reset_complete')
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
    await this.passwordService.changePasswordViaResetToken(userId, body);
    return { message: 'OK' };
  }
}
