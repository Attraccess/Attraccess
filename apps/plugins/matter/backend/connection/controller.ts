import { Auth, type AuthenticatedRequest, type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Put, Req } from '@nestjs/common';
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
  ) {}

  /** The saved settings. The credential is never part of the answer. */
  @Auth(...MATTER_OPERATIONS.connectionSettings)
  @Get()
  get(): Promise<PublicSettings> {
    return this.settings.publicView();
  }

  @Auth(...MATTER_OPERATIONS.connectionSave)
  @Put()
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

  @Auth(...MATTER_OPERATIONS.connectionStatus)
  @Get('status')
  status(): ConnectionStatus {
    return this.service.connection.status();
  }
}
