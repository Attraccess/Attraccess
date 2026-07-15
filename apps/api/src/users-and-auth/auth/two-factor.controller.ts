import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { TwoFactorService } from './two-factor.service';
import {
  TwoFactorCodeDto,
  TwoFactorPolicyDto,
  TwoFactorSetupResponseDto,
  TwoFactorStatusDto,
} from './two-factor.dto';

@ApiTags('Two-Factor Authentication')
@Controller('/auth/two-factor')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Auth()
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

  @Auth()
  @Post('setup')
  @ApiOperation({ summary: 'Start 2FA setup for the current user', operationId: 'setupTwoFactor' })
  @ApiResponse({
    status: 200,
    description: '2FA setup details (secret and otpauth URL)',
    type: TwoFactorSetupResponseDto,
  })
  async setup(@Req() request: AuthenticatedRequest): Promise<TwoFactorSetupResponseDto> {
    return this.twoFactorService.createSetup(request.user);
  }

  @Auth()
  @Post('verify')
  @ApiOperation({ summary: 'Verify and enable 2FA for the current user', operationId: 'verifyTwoFactor' })
  @ApiResponse({
    status: 200,
    description: '2FA status after verification',
    type: TwoFactorStatusDto,
  })
  async verify(@Req() request: AuthenticatedRequest, @Body() body: TwoFactorCodeDto): Promise<TwoFactorStatusDto> {
    await this.twoFactorService.enable(request.user, body.code);
    return this.twoFactorService.getStatus(request.user);
  }

  @Auth()
  @Post('disable')
  @ApiOperation({ summary: 'Disable 2FA for the current user', operationId: 'disableTwoFactor' })
  @ApiResponse({
    status: 200,
    description: '2FA has been disabled',
  })
  async disable(@Req() request: AuthenticatedRequest, @Body() body: TwoFactorCodeDto): Promise<void> {
    await this.twoFactorService.disable(request.user, body.code);
  }

  @Auth('users.update')
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

  @Auth('users.update')
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
}
