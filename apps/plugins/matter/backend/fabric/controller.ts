import { Auth, type AuthenticatedRequest, NotAnMcpTool } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { MATTER_OPERATIONS } from '../permissions';
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
@Controller('matter')
export class MatterFabricController {
  constructor(
    @Inject(MatterFabricService) private readonly fabric: MatterFabricService,
    @Inject(RecoveryKeyService) private readonly keys: RecoveryKeyService,
  ) {}

  @Auth(...MATTER_OPERATIONS.fabricStatus)
  @Get('fabric')
  status(): Promise<FabricBackupStatus> {
    return this.fabric.status();
  }

  @Auth(...MATTER_OPERATIONS.fabricCreate)
  @Post('fabric/create')
  @HttpCode(200)
  @NotAnMcpTool('Key material: creates the fabric and returns its recovery key')
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<CreateResult> {
    return this.fabric.create(parse(createFabricSchema, body).label, principalOf(request));
  }

  @Auth(...MATTER_OPERATIONS.recoveryKeyGenerate)
  @Post('fabric/recovery-key')
  @HttpCode(200)
  @NotAnMcpTool('Secret management: reveals a recovery key')
  generateKey(@Req() request: AuthenticatedRequest): Promise<RecoveryKeyReveal> {
    return this.fabric.generateRecoveryKey(principalOf(request));
  }

  @Auth(...MATTER_OPERATIONS.recoveryKeyAcknowledge)
  @Post('fabric/recovery-key/acknowledge')
  @HttpCode(200)
  @NotAnMcpTool('Secret management: recovery key handling')
  async acknowledge(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<FabricBackupStatus> {
    await this.keys.acknowledge(parse(acknowledgeSchema, body).keyId, principalOf(request));
    return this.fabric.status();
  }

  @Auth(...MATTER_OPERATIONS.recoveryKeyRotate)
  @Post('fabric/recovery-key/rotate')
  @HttpCode(200)
  @NotAnMcpTool('Secret management: reveals a rotated recovery key')
  rotate(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<RecoveryKeyReveal> {
    parse(rotateSchema, body);
    return this.fabric.rotateRecoveryKey(principalOf(request));
  }

  @Auth(...MATTER_OPERATIONS.recoveryAcceptSidecar)
  @Post('recovery/accept-sidecar')
  @HttpCode(200)
  @NotAnMcpTool('Key material: fabric recovery')
  acceptSidecar(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<FabricBackupStatus> {
    parse(acceptSidecarSchema, body);
    return this.fabric.acceptSidecar(principalOf(request));
  }

  @Auth(...MATTER_OPERATIONS.recoveryStartNew)
  @Post('recovery/start-new')
  @HttpCode(200)
  @NotAnMcpTool('Key material: replaces the fabric')
  startNew(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<CreateResult> {
    return this.fabric.startNew(parse(startNewSchema, body).label, principalOf(request));
  }
}
