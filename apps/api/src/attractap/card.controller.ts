import { Controller, Get, Inject, Post, Req, Body } from '@nestjs/common';
import { AttractapGateway } from './websockets/websocket.gateway';
import { Auth, AuthenticatedRequest, NFCCard } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { AttractapService } from './attractap.service';
import { AppKeyRequestDto } from './dtos/app-key-request.dto';
import { AppKeyResponseDto } from './dtos/app-key-response.dto';

@ApiTags('Attractap')
@Controller('attractap/cards')
export class AttractapNfcCardsController {
  public constructor(
    @Inject(AttractapGateway)
    private readonly attractapGateway: AttractapGateway,
    @Inject(AttractapService)
    private readonly attractapService: AttractapService
  ) {}

  @Post('keys')
  @Auth('canManageUsers')
  @ApiOperation({ summary: 'Get the app key for a card by UID', operationId: 'getAppKeyByUid' })
  @ApiBody({ type: AppKeyRequestDto })
  @ApiResponse({
    status: 200,
    description: 'The app key for the card',
    type: AppKeyResponseDto,
  })
  async getAppKeyByUid(@Body() appKeyRequest: AppKeyRequestDto, @Req() req: AuthenticatedRequest): Promise<AppKeyResponseDto> {
    const key = await this.attractapService.generateNTAG424Key({
      keyNo: appKeyRequest.keyNo,
      cardUID: appKeyRequest.cardUID,
      userId: req.user.id,
    });

    return {
      key: this.attractapService.uint8ArrayToHexString(key),
    };
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get all cards (to which you have access)', operationId: 'getAllCards' })
  @ApiResponse({
    status: 200,
    description: 'The list of all cards',
    type: [NFCCard],
  })
  async getCards(@Req() req: AuthenticatedRequest): Promise<NFCCard[]> {
    let cards;

    if (req.user.systemPermissions.canManageSystemConfiguration) {
      cards = await this.attractapService.getAllNFCCards();
    } else {
      cards = await this.attractapService.getNFCCardsByUserId(req.user.id);
    }

    return cards;
  }
}
