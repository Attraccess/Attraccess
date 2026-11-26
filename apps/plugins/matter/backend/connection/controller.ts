import {
  Auth,
  type AuthenticatedRequest,
  type PluginAuditPrincipal,
  NotAnMcpTool,
} from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Post, Put, Req } from '@nestjs/common';
import { conflict } from '../fabric/errors';
import { MatterFabricGuard } from '../fabric/guard';
import { MATTER_OPERATIONS } from '../permissions';
import { MatterConnectionService } from './connection.service';
import { MissingCredentialError, MatterSettingsService, type PublicSettings } from './settings.service';
import { settingsSchema, validationMessages } from './validation';
import type { ConnectionStatus } from '../client/connection';

export function principalOf(request: AuthenticatedRequest): PluginAuditPrincipal {
  const user = request.user;
  return {
    userId: user.id,
    authenticationMethod: user.authenticationMethod ?? 'session',
    ...(user.apiTokenId === undefined ? {} : { apiTokenId: user.apiTokenId }),
  };
}

@Controller('matter/connection')
export class MatterConnectionController {
  constructor(
    @Inject(MatterSettingsService) private readonly settings: MatterSettingsService,
    @Inject(MatterConnectionService) private readonly service: MatterConnectionService,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
  ) {}

  /** The saved settings. The credential is never part of the answer. */
  @Auth(...MATTER_OPERATIONS.connectionSettings)
  @Get()
  get(): Promise<PublicSettings> {
    return this.settings.publicView();
  }

  @Auth(...MATTER_OPERATIONS.connectionSave)
  @Put()
  @NotAnMcpTool('Credential flow: stores the sidecar credential')
  async put(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<PublicSettings> {
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(validationMessages(parsed.error));
    const principal = principalOf(request);
    let changed;
    try {
      changed = await this.settings.save(parsed.data, principal.userId);
    } catch (error) {
      if (error instanceof MissingCredentialError) throw new BadRequestException([error.message]);
      throw error;
    }
    // Audited right after the save: the change is made even if reconnecting fails.
    await this.settings.audit('matter.connection_saved', principal, {
      credentialChanged: changed.credentialChanged,
      caChanged: changed.caChanged,
      scheme: parsed.data.url.trim().toLowerCase().startsWith('https:') ? 'https' : 'http',
    });
    await this.service.reload();
    return this.settings.publicView();
  }

  /** Clears the configuration. The client stops and reports `not_configured`. */
  @Auth(...MATTER_OPERATIONS.connectionRemove)
  @Delete()
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest): Promise<void> {
    const removed = await this.settings.remove();
    if (removed) await this.settings.audit('matter.connection_removed', principalOf(request));
    await this.service.reload();
  }

  /**
   * "Retry now": reconnects at once instead of waiting for the next backoff step. Reads the saved settings again and
   * changes nothing; with no configuration it stays `not_configured`. Answers with the status as it is right after.
   * A healthy connection is left alone (nothing to retry, nothing audited), and a running fabric operation (fabric
   * creation, accepting the sidecar's fabric, restore) is never cut off: a reconnect would abort its in-flight sidecar
   * requests (409 `busy`).
   */
  @Auth(...MATTER_OPERATIONS.connectionReconnect)
  @Post('reconnect')
  @HttpCode(200)
  async reconnect(@Req() request: AuthenticatedRequest): Promise<ConnectionStatus> {
    const current = this.service.connection.status();
    if (current.state === 'connected') return current;
    if (this.guard.busy || this.guard.restoring) {
      throw conflict('busy', 'A fabric operation is in progress. Try again when it has finished.');
    }
    await this.settings.audit('matter.connection_reconnect_requested', principalOf(request));
    await this.service.reload();
    return this.service.connection.status();
  }

  @Auth(...MATTER_OPERATIONS.connectionStatus)
  @Get('status')
  status(): ConnectionStatus {
    return this.service.connection.status();
  }
}
