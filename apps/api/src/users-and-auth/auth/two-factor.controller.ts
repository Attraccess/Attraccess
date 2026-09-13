import { Body, Controller, Get, Optional, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorCodeDto, TwoFactorPolicyDto, TwoFactorSetupResponseDto, TwoFactorStatusDto } from './two-factor.dto';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { randomUUID } from 'node:crypto';

@ApiTags('Two-Factor Authentication')
@Controller('/auth/two-factor')
export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    @Optional() private readonly identityAudit?: IdentityAuditService,
  ) {}

  @SessionAuth()
  @Get()
  @ApiOperation({ summary: 'Get 2FA status for the current user', operationId: 'getTwoFactorStatus' })
  @ApiResponse({
    status: 200,
    description: '2FA status for the current user',
    type: TwoFactorStatusDto,
  })
  async getStatus(@Req() request: AuthenticatedRequest): Promise<TwoFactorStatusDto> {
    return this.twoFactorService.getStatus(request.user);
  }

  @SessionAuth()
  @Post('setup')
  @ApiOperation({ summary: 'Start 2FA setup for the current user', operationId: 'setupTwoFactor' })
  @ApiResponse({
    status: 200,
    description: '2FA setup details (secret and otpauth URL)',
    type: TwoFactorSetupResponseDto,
  })
  async setup(@Req() request: AuthenticatedRequest): Promise<TwoFactorSetupResponseDto> {
    const result = await this.twoFactorService.createSetup(request.user);
    this.record('two_factor_setup_started', request);
    return result;
  }

  @SessionAuth()
  @Post('verify')
  @ApiOperation({ summary: 'Verify and enable 2FA for the current user', operationId: 'verifyTwoFactor' })
  @ApiResponse({
    status: 200,
    description: '2FA status after verification',
    type: TwoFactorStatusDto,
  })
  async verify(@Req() request: AuthenticatedRequest, @Body() body: TwoFactorCodeDto): Promise<TwoFactorStatusDto> {
    await this.twoFactorService.enable(request.user, body.code);
    this.record('two_factor_enabled', request);
    return this.twoFactorService.getStatus(request.user);
  }

  @SessionAuth()
  @Post('disable')
  @ApiOperation({ summary: 'Disable 2FA for the current user', operationId: 'disableTwoFactor' })
  @ApiResponse({
    status: 200,
    description: '2FA has been disabled',
  })
  async disable(@Req() request: AuthenticatedRequest, @Body() body: TwoFactorCodeDto): Promise<void> {
    await this.twoFactorService.disable(request.user, body.code);
    this.record('two_factor_disabled', request);
  }

  @SessionAuth('users.update')
  @Get('policy')
  @ApiOperation({ summary: 'Get the configured 2FA policy', operationId: 'getTwoFactorPolicy' })
  @ApiResponse({
    status: 200,
    description: 'The configured 2FA policy',
    type: TwoFactorPolicyDto,
  })
  async getPolicy(): Promise<TwoFactorPolicyDto> {
    const policy = await this.twoFactorService.getPolicy();
    return { policy };
  }

  @SessionAuth('users.update')
  @Post('policy')
  @ApiOperation({ summary: 'Set the configured 2FA policy', operationId: 'setTwoFactorPolicy' })
  @ApiResponse({
    status: 200,
    description: 'The configured 2FA policy has been updated',
    type: TwoFactorPolicyDto,
  })
  async setPolicy(@Body() body: TwoFactorPolicyDto): Promise<TwoFactorPolicyDto> {
    await this.twoFactorService.setPolicy(body.policy);
    return { policy: body.policy };
  }

  private record(
    action: 'two_factor_setup_started' | 'two_factor_enabled' | 'two_factor_disabled',
    request: AuthenticatedRequest,
  ): void {
    void this.identityAudit?.record({
      action,
      operationId: randomUUID(),
      outcome: 'succeeded',
      actorId: request.user.id,
      authenticationMethod: request.user.authenticationMethod ?? 'session',
      apiTokenId: request.user.apiTokenId,
      subjectId: request.user.id,
      details: {},
      request: { ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });
  }
}
