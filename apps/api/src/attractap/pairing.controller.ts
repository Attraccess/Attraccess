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
import { ApprovePairingDto, PairingDto, ResolvePairingDto } from './dtos/pairing.dto';
import { AttractapCredentialEventDto, toCredentialEventDto } from './dtos/credential-event.dto';
import { ClusterPairingService } from './security/cluster-pairing.service';
import { CredentialRegistryService } from './security/credential-registry.service';
import { Actor, PairingService } from './security/pairing.service';

function actorOf(req: AuthenticatedRequest): Actor {
  return {
    userId: req.user.id,
    authenticationMethod: req.user.authenticationMethod ?? 'session',
    ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
  };
}

@ApiTags('Attractap')
@Controller('attractap')
@UseInterceptors(ClassSerializerInterceptor)
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class AttractapPairingController {
  public constructor(
    @Inject(PairingService) private readonly pairing: PairingService,
    // Waiting readers may be held by another API instance (ATT-1163).
    @Inject(ClusterPairingService) private readonly pairings: ClusterPairingService,
    @Inject(CredentialRegistryService) private readonly registry: CredentialRegistryService,
  ) {}

  @Get('pairings')
  @Auth('resources.update')
  @ApiOperation({ summary: 'List readers waiting to pair; never includes codes', operationId: 'getPairings' })
  @ApiResponse({ status: 200, type: [PairingDto] })
  public async list(): Promise<PairingDto[]> {
    return await this.pairings.list();
  }

  @Post('pairings/resolve')
  @Auth('resources.update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Find the waiting reader that shows this code', operationId: 'resolvePairing' })
  @ApiResponse({ status: 200, type: PairingDto })
  @ApiResponse({ status: 404, description: 'No waiting reader shows this code (counts toward the limit)' })
  @ApiResponse({ status: 409, description: 'Two readers show this code; wait for the next one' })
  @ApiResponse({ status: 429, description: 'Too many wrong codes' })
  public async resolve(@Body() body: ResolvePairingDto, @Req() req: AuthenticatedRequest): Promise<PairingDto> {
    return await this.pairings.resolve(body.code, actorOf(req));
  }

  @Get('pairings/:pairingId')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Get one pairing; a Lite reader includes its current pattern', operationId: 'getPairing' })
  @ApiResponse({ status: 200, type: PairingDto })
  public async get(@Param('pairingId') pairingId: string): Promise<PairingDto> {
    return await this.pairings.get(pairingId);
  }

  @Post('pairings/:pairingId/approve')
  @Auth('resources.update')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a waiting reader: enrolls and pairs it in one step',
    operationId: 'approvePairing',
  })
  @ApiResponse({ status: 200, type: PairingDto })
  @ApiResponse({ status: 404, description: 'The code does not match this reader (counts toward the limit)' })
  @ApiResponse({ status: 409, description: 'Stale pattern, ambiguous code or the pairing is over' })
  @ApiResponse({ status: 429, description: 'Too many wrong codes' })
  public async approve(
    @Param('pairingId') pairingId: string,
    @Body() body: ApprovePairingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PairingDto> {
    return await this.pairings.approve(pairingId, body, actorOf(req));
  }

  @Delete('pairings/:pairingId')
  @Auth('resources.update')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel a pairing', operationId: 'cancelPairing' })
  public async cancel(@Param('pairingId') pairingId: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.pairings.cancel(pairingId, actorOf(req));
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
  @ApiResponse({ status: 200, type: [AttractapCredentialEventDto] })
  public async history(@Param('readerId', ParseIntPipe) readerId: number): Promise<AttractapCredentialEventDto[]> {
    return (await this.registry.history(readerId)).map(toCredentialEventDto);
  }
}
