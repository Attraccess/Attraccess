import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PushSubscription } from '@attraccess/database-entities';
import { PushService } from './push.service';
import { VapidPublicKeyResponseDto } from './dtos/vapidPublicKeyResponse.dto';
import { VapidConfigDto } from './dtos/vapidConfig.dto';
import { ReplaceVapidKeysDto, ReplaceVapidKeysResponseDto } from './dtos/replaceVapidKeys.dto';
import { CreatePushSubscriptionDto } from './dtos/createPushSubscription.dto';
import { DeletePushSubscriptionQueryDto } from './dtos/deletePushSubscriptionQuery.dto';

@ApiTags('Push')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  @Auth()
  @ApiOperation({
    summary: 'Get the VAPID public key used to subscribe to push notifications (auto-generated on first use)',
    operationId: 'pushGetVapidPublicKey',
  })
  @ApiResponse({ status: 200, description: 'The VAPID public key', type: VapidPublicKeyResponseDto })
  async getVapidPublicKey(): Promise<VapidPublicKeyResponseDto> {
    return { publicKey: await this.pushService.getPublicKey() };
  }

  @Get('vapid-keys')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({
    summary: 'Get the current VAPID configuration (admin)',
    operationId: 'pushGetVapidConfig',
  })
  @ApiResponse({ status: 200, description: 'The current VAPID configuration', type: VapidConfigDto })
  async getVapidConfig(): Promise<VapidConfigDto> {
    const [publicKey, subscriptionCount] = await Promise.all([
      this.pushService.getPublicKey(),
      this.pushService.getSubscriptionCount(),
    ]);
    return { publicKey, subscriptionCount };
  }

  @Put('vapid-keys')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({
    summary:
      'Replace the VAPID key pair (admin). Omit the body keys to auto-generate a fresh pair. ' +
      'WARNING: all existing push subscriptions are deleted because they are bound to the old key.',
    operationId: 'pushReplaceVapidKeys',
  })
  @ApiResponse({
    status: 200,
    description: 'The new VAPID public key and the number of deleted subscriptions',
    type: ReplaceVapidKeysResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Only one of publicKey/privateKey was provided, or a key is invalid' })
  async replaceVapidKeys(@Body() dto: ReplaceVapidKeysDto): Promise<ReplaceVapidKeysResponseDto> {
    const hasPublicKey = Boolean(dto.publicKey?.trim());
    const hasPrivateKey = Boolean(dto.privateKey?.trim());

    if (hasPublicKey !== hasPrivateKey) {
      throw new BadRequestException('Provide both publicKey and privateKey to override, or neither to regenerate');
    }

    const { keys, deletedSubscriptions } = await this.pushService.replaceVapidKeys(
      hasPublicKey
        ? { publicKey: dto.publicKey as string, privateKey: dto.privateKey as string }
        : undefined,
    );

    return { publicKey: keys.publicKey, deletedSubscriptions };
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
