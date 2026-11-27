import { Auth, type AuthenticatedRequest, NotAnMcpTool } from '@attraccess/plugins-backend-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { z } from 'zod';
import { principalOf } from '../connection/controller';
import { validationMessages } from '../connection/validation';
import { MatterLifecycleService } from '../devices/lifecycle.service';
import { idParamSchema } from '../devices/schemas';
import { nodeDetailView, nodeView } from '../devices/views';
import { forbidden } from '../fabric/errors';
import { MATTER_OPERATIONS } from '../permissions';
import { MatterCommissioningService } from './commissioning.service';
import { MatterNodeRemovalService } from './removal.service';
import { finishSchema, removeSchema, shareSchema, startSchema } from './schemas';
import { MatterNodeSharingService } from './sharing.service';

function parse<S extends z.ZodType>(schema: S, value: unknown, where = 'body'): z.infer<S> {
  const parsed = schema.safeParse(value);
  // Messages only: the submitted values (a setup code above all) are never echoed back.
  if (!parsed.success) throw new BadRequestException(validationMessages(parsed.error, where));
  return parsed.data;
}

const parseId = (id: string) => parse(idParamSchema, id, 'id');

/** Whether the caller holds every key of the attestation override (commission and manage). */
const mayOverride = (request: AuthenticatedRequest): boolean =>
  MATTER_OPERATIONS.attestationOverride.every((key) => request.user.effectivePermissions?.has(key) === true);

/**
 * Commissioning, removal and sharing of Matter devices. Setup and sharing codes travel only in the bodies of POST
 * requests and the share response; they are not stored, logged or echoed anywhere.
 */
@Controller('matter')
export class MatterCommissioningController {
  constructor(
    @Inject(MatterCommissioningService) private readonly commissioning: MatterCommissioningService,
    @Inject(MatterNodeRemovalService) private readonly removal: MatterNodeRemovalService,
    @Inject(MatterNodeSharingService) private readonly sharing: MatterNodeSharingService,
    @Inject(MatterLifecycleService) private readonly lifecycle: MatterLifecycleService,
  ) {}

  @Auth(...MATTER_OPERATIONS.commissioningStart)
  @Post('commissioning/sessions')
  @NotAnMcpTool('Credential flow: takes device setup codes')
  async start(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(startSchema, body);
    if (input.attestationOverride && !mayOverride(request)) {
      throw forbidden(
        'attestation_override_forbidden',
        'The attestation override needs the permissions to commission and to manage Matter devices.',
      );
    }
    return this.commissioning.start(input, principalOf(request));
  }

  /** Declared before `:id`, so `current` is not read as a session ID. */
  @Auth(...MATTER_OPERATIONS.commissioningStatus)
  @Get('commissioning/sessions/current')
  current(@Req() request: AuthenticatedRequest) {
    return this.commissioning.current(request.user.id);
  }

  @Auth(...MATTER_OPERATIONS.commissioningStatus)
  @Get('commissioning/sessions/:id')
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.commissioning.get(parseId(id), request.user.id);
  }

  @Auth(...MATTER_OPERATIONS.commissioningStart)
  @Delete('commissioning/sessions/:id')
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.commissioning.cancel(parseId(id), request.user.id);
  }

  @Auth(...MATTER_OPERATIONS.commissioningStart)
  @Post('commissioning/sessions/:id/finish')
  @HttpCode(200)
  async finish(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const node = await this.commissioning.finish(parseId(id), request.user.id, parse(finishSchema, body ?? {}));
    return { node: nodeDetailView(await this.lifecycle.getNode(node.id)) };
  }

  @Auth(...MATTER_OPERATIONS.commissioningRemoveFromFabric)
  @Post('nodes/:id/remove')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.removal.remove(parseId(id), parse(removeSchema, body), principalOf(request)));
  }

  @Auth(...MATTER_OPERATIONS.commissioningShare)
  @Post('nodes/:id/share')
  @HttpCode(200)
  // The answer carries the sharing codes: no cache, proxy or browser may keep it.
  @Header('Cache-Control', 'no-store')
  @NotAnMcpTool('Secret management: returns device sharing codes')
  async share(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.sharing.open(parseId(id), parse(shareSchema, body ?? {}), principalOf(request));
  }

  @Auth(...MATTER_OPERATIONS.commissioningShare)
  @Delete('nodes/:id/share')
  async revokeShare(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.sharing.revoke(parseId(id), principalOf(request));
  }
}
