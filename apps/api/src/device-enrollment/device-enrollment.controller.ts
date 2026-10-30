import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { ApproveDeviceEnrollmentDto, ApproveDeviceEnrollmentResponseDto } from './dtos/approve-device-enrollment.dto';

@ApiTags('Device enrollment')
@Controller('device-enrollment')
export class DeviceEnrollmentController {
  constructor(private readonly enrollment: DeviceEnrollmentService) {}

  @Post('approve')
  @HttpCode(200)
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Approve a waiting device with the code it shows',
    operationId: 'approveDeviceEnrollment',
  })
  @ApiResponse({ status: 200, type: ApproveDeviceEnrollmentResponseDto })
  @ApiResponse({ status: 404, description: 'No waiting device shows this code' })
  @ApiResponse({
    status: 429,
    description: 'Too many wrong codes (EnrollmentRateLimited); retryAfterSeconds says when to try again',
  })
  @ApiResponse({ status: 502, description: 'The device did not confirm; nothing was created' })
  async approve(
    @Body() body: ApproveDeviceEnrollmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ApproveDeviceEnrollmentResponseDto> {
    return this.enrollment.approve(
      body.code,
      {
        userId: req.user.id,
        authenticationMethod: req.user.authenticationMethod ?? 'session',
        ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
      },
      { name: body.name },
    );
  }
}
