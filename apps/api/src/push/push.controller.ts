import { Body, Controller, Delete, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PushSubscription } from '@attraccess/database-entities';
import { PushService } from './push.service';
import { VapidPublicKeyResponseDto } from './dtos/vapidPublicKeyResponse.dto';
import { CreatePushSubscriptionDto } from './dtos/createPushSubscription.dto';
import { DeletePushSubscriptionQueryDto } from './dtos/deletePushSubscriptionQuery.dto';

@ApiTags('Push')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  @Auth()
  @ApiOperation({
    summary: 'Get the VAPID public key used to subscribe to push notifications (null when push is disabled)',
    operationId: 'pushGetVapidPublicKey',
  })
  @ApiResponse({ status: 200, description: 'The VAPID public key', type: VapidPublicKeyResponseDto })
  getVapidPublicKey(): VapidPublicKeyResponseDto {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('subscriptions')
  @Auth()
  @ApiOperation({
    summary: 'Create or update a push subscription for the authenticated user',
    operationId: 'pushUpsertSubscription',
  })
  @ApiResponse({ status: 201, description: 'The stored push subscription', type: PushSubscription })
  async upsertSubscription(
    @Body() dto: CreatePushSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PushSubscription> {
    return this.pushService.upsertSubscription(req.user.id, dto);
  }

  @Delete('subscriptions')
  @Auth()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a push subscription of the authenticated user by its endpoint',
    operationId: 'pushDeleteSubscription',
  })
  @ApiResponse({ status: 204, description: 'The subscription was deleted (or did not exist)' })
  async deleteSubscription(
    @Query() query: DeletePushSubscriptionQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.pushService.deleteSubscription(req.user.id, query.endpoint);
  }
}
