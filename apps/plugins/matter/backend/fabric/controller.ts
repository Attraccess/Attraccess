import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { z } from 'zod';
import { principalOf } from '../connection/controller';
import { validationMessages } from '../connection/validation';
import { MatterFabricService, type CreateResult, type FabricBackupStatus } from './fabric.service';
import { RecoveryKeyService, type RecoveryKeyReveal } from './recovery-key.service';
import { acceptSidecarSchema, acknowledgeSchema, createFabricSchema, rotateSchema, startNewSchema } from './schemas';

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) throw new BadRequestException(validationMessages(parsed.error));
  return parsed.data;
}

/**
 * Admin REST API for the controller fabric: status, creation, the recovery key and the recovery actions. Secrets are
 * returned only where documented: the recovery key, once, when it is generated.
 */
// TODO(ATT-1003): replace system.plugins.manage with a dedicated Matter permission
@Auth('system.plugins.manage')
@Controller('matter')
export class MatterFabricController {
  constructor(
    @Inject(MatterFabricService) private readonly fabric: MatterFabricService,
    @Inject(RecoveryKeyService) private readonly keys: RecoveryKeyService,
  ) {}

  @Get('fabric')
  status(): Promise<FabricBackupStatus> {
    return this.fabric.status();
  }

  @Post('fabric/create')
  @HttpCode(200)
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<CreateResult> {
    return this.fabric.create(parse(createFabricSchema, body).label, principalOf(request));
  }

  @Post('fabric/recovery-key')
  @HttpCode(200)
  generateKey(@Req() request: AuthenticatedRequest): Promise<RecoveryKeyReveal> {
    return this.fabric.generateRecoveryKey(principalOf(request));
  }

  @Post('fabric/recovery-key/acknowledge')
  @HttpCode(200)
  async acknowledge(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<FabricBackupStatus> {
    await this.keys.acknowledge(parse(acknowledgeSchema, body).keyId, principalOf(request));
    return this.fabric.status();
  }

  @Post('fabric/recovery-key/rotate')
  @HttpCode(200)
  rotate(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<RecoveryKeyReveal> {
    parse(rotateSchema, body);
    return this.fabric.rotateRecoveryKey(principalOf(request));
  }

  @Post('recovery/accept-sidecar')
  @HttpCode(200)
  acceptSidecar(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<FabricBackupStatus> {
    parse(acceptSidecarSchema, body);
    return this.fabric.acceptSidecar(principalOf(request));
  }

  @Post('recovery/start-new')
  @HttpCode(200)
  startNew(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<CreateResult> {
    return this.fabric.startNew(parse(startNewSchema, body).label, principalOf(request));
  }
}
