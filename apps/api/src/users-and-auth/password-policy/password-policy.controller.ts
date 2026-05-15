// Public password policy endpoint serving sanitized policy for client-side rendering
// FEATURE: Password policy public surface (no internal flags exposed)

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PublicPasswordPolicy } from '@attraccess/shared';
import { PasswordPolicyService } from './password-policy.service';
import { PublicPasswordPolicyDto } from './public-password-policy.dto';

@ApiTags('Password Policy')
@Controller('password-policy')
export class PasswordPolicyController {
  constructor(private readonly service: PasswordPolicyService) {}

  @Get('public')
  @ApiOperation({ summary: 'Get the public password policy', operationId: 'getPublicPasswordPolicy' })
  @ApiResponse({ status: 200, description: 'The currently active public password policy', type: PublicPasswordPolicyDto })
  async getPublic(): Promise<PublicPasswordPolicy> {
    return this.service.getPublicPolicy();
  }
}
