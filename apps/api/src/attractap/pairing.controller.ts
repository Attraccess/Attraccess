import { AttractapCredentialEvent } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { PairingDto, RequestPairingResponseDto, StartPairingDto } from './dtos/pairing.dto';
import { CredentialRegistryService } from './security/credential-registry.service';
import { Actor, PairingService, PairingView } from './security/pairing.service';
import { AttractapEvent, AttractapEventType } from './websockets/websocket.types';
import { WebsocketService } from './websockets/websocket.service';

function actorOf(req: AuthenticatedRequest): Actor {
  return {
    userId: req.user.id,
    authenticationMethod: req.user.authenticationMethod ?? 'session',
    ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
  };
}

function toDto(view: PairingView): PairingDto {
  return { ...view, code: view.code ? { kind: view.code.kind, value: view.code.value } : null };
}

@ApiTags('Attractap')
@Controller('attractap')
@UseInterceptors(ClassSerializerInterceptor)
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class AttractapPairingController {
  public constructor(
    @Inject(PairingService) private readonly pairing: PairingService,
    @Inject(CredentialRegistryService) private readonly registry: CredentialRegistryService,
    @Inject(WebsocketService) private readonly sockets: WebsocketService,
  ) {}

  @Get('pairings')
  @Auth('resources.update')
  @ApiOperation({ summary: 'List readers waiting to pair and pairings in progress', operationId: 'getPairings' })
  @ApiResponse({ status: 200, type: [PairingDto] })
  public list(): PairingDto[] {
    return this.pairing.list().map(toDto);
  }

  @Get('pairings/:pairingId')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Get one pairing, including its code once started', operationId: 'getPairing' })
  @ApiResponse({ status: 200, type: PairingDto })
  public get(@Param('pairingId') pairingId: string): PairingDto {
    return toDto(this.pairing.get(pairingId));
  }

  @Post('pairings/:pairingId/start')
  @Auth('resources.update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start pairing: reveals the code to compare', operationId: 'startPairing' })
  @ApiResponse({ status: 200, type: PairingDto })
  public async start(
    @Param('pairingId') pairingId: string,
    @Body() body: StartPairingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PairingDto> {
    return toDto(await this.pairing.start(pairingId, body, actorOf(req)));
  }

  @Post('pairings/:pairingId/confirm')
  @Auth('resources.update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm that the code matches the one on the reader', operationId: 'confirmPairing' })
  @ApiResponse({ status: 200, type: PairingDto })
  public async confirm(@Param('pairingId') pairingId: string): Promise<PairingDto> {
    return toDto(await this.pairing.confirm(pairingId));
  }

  @Delete('pairings/:pairingId')
  @Auth('resources.update')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel a pairing', operationId: 'cancelPairing' })
  public async cancel(@Param('pairingId') pairingId: string): Promise<void> {
    await this.pairing.cancel(pairingId);
  }

  @Post('readers/:readerId/pair')
  @Auth('resources.update')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Ask a connected reader to start pairing; it then appears in the pairing list',
    operationId: 'requestReaderPairing',
  })
  @ApiResponse({ status: 202, type: RequestPairingResponseDto })
  public async requestPairing(@Param('readerId', ParseIntPipe) readerId: number): Promise<RequestPairingResponseDto> {
    const targets = [...this.sockets.sockets.values()].filter(
      (socket) => socket.readerId === readerId && socket.transport !== 'session',
    );
    // A one-time ticket binds the reader's pairing request to this record; the token stays out of pairing.
    await Promise.all(
      targets.map((socket) =>
        socket.sendMessage(
          new AttractapEvent(AttractapEventType.READER_START_PAIRING, {
            ticket: this.pairing.issueBindingTicket(readerId),
          }),
        ),
      ),
    );
    return { requested: targets.length > 0 };
  }

  @Post('readers/:readerId/revoke')
  @Auth('resources.update')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a reader credential and end its session', operationId: 'revokeReader' })
  public async revoke(@Param('readerId', ParseIntPipe) readerId: number, @Req() req: AuthenticatedRequest) {
    await this.pairing.revoke(readerId, actorOf(req));
  }

  @Get('readers/:readerId/credentials')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Credential history of a reader', operationId: 'getReaderCredentialHistory' })
  @ApiResponse({ status: 200, type: [AttractapCredentialEvent] })
  public async history(@Param('readerId', ParseIntPipe) readerId: number): Promise<AttractapCredentialEvent[]> {
    return await this.registry.history(readerId);
  }
}
