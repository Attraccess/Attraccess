import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeviceEnrollmentService } from './device-enrollment.service';
import {
  ApproveDeviceEnrollmentDto,
  ApproveDeviceEnrollmentResponseDto,
  ApproveLiteEnrollmentDto,
  WaitingLiteReaderDto,
} from './dtos/approve-device-enrollment.dto';

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
  @ApiResponse({ status: 429, description: 'Too many wrong codes' })
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

  @Get('lite-pending')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'List waiting readers without a screen and the colour pattern each one shows',
    operationId: 'listWaitingLiteReaders',
  })
  @ApiResponse({ status: 200, type: WaitingLiteReaderDto, isArray: true })
  listLitePending(): WaitingLiteReaderDto[] {
    return this.enrollment.listLitePending();
  }

  @Post('approve-lite')
  @HttpCode(200)
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Approve a waiting reader without a screen by the colour pattern on its LED ring',
    operationId: 'approveLiteEnrollment',
  })
  @ApiResponse({ status: 200, type: ApproveDeviceEnrollmentResponseDto })
  @ApiResponse({ status: 404, description: 'No waiting Lite reader shows this pattern' })
  @ApiResponse({ status: 429, description: 'Too many wrong attempts' })
  @ApiResponse({ status: 502, description: 'The device did not confirm; nothing was created' })
  async approveLite(
    @Body() body: ApproveLiteEnrollmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ApproveDeviceEnrollmentResponseDto> {
    return this.enrollment.approveLite(
      body.pendingId,
      body.pattern,
      {
        userId: req.user.id,
        authenticationMethod: req.user.authenticationMethod ?? 'session',
        ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
      },
      { name: body.name },
    );
  }
}
