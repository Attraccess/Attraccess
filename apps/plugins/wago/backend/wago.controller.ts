import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { commissioningPrincipal } from './wago-commissioning-audit';
import { WagoService } from './wago.service';
import { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoPresetApplication } from './configuration';

type CommissioningAttemptInput = { confirmInstall?: boolean; temporarySsh?: { username?: string; password?: string } };

function validateCommissioningAttempt(body: CommissioningAttemptInput, intent: 'installation' | 'recovery') {
  if (body?.confirmInstall !== true) throw new BadRequestException(`Explicit ${intent} consent is required`);
  if (
    typeof body.temporarySsh?.username !== 'string' ||
    !body.temporarySsh.username.trim() ||
    typeof body.temporarySsh.password !== 'string' ||
    !body.temporarySsh.password
  ) {
    throw new BadRequestException('Temporary SSH username and password are required');
  }
  return {
    confirmInstall: true as const,
    temporarySsh: { username: body.temporarySsh.username, password: body.temporarySsh.password },
  };
}

@Auth('resources.update')
@Controller('wago')
export class WagoControllerApi {
  constructor(
    @Inject(WagoService) private readonly wago: WagoService,
    @Inject(WagoCommissioningService) private readonly commissioning: WagoCommissioningService,
  ) {}
  @Get('controllers') list() {
    return this.wago.list();
  }
  @Auth('system.settings.manage')
  @Get('settings')
  settings() {
    return this.wago.getSettings();
  }
  @Auth('system.settings.manage')
  @Post('settings')
  setSettings(@Body() body: { defaultMqttServerId?: number | null; operationalPrefix?: string }) {
    return this.wago.setSettings(body?.defaultMqttServerId, body?.operationalPrefix);
  }
  @Auth('system.settings.manage')
  @Get('commissioning/support')
  commissioningSupport() {
    return this.commissioning.support();
  }
  @Auth('system.settings.manage')
  @Get('commissioning/sessions')
  commissioningSessions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.commissioning.list(Number(limit), Number(offset));
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions')
  createCommissioningSession(
    @Body() body: { mqttServerId?: number; targetHost?: string; name?: string; runtimeArtifactDigest?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body?.mqttServerId) throw new BadRequestException('MQTT server is required');
    if (!body.name?.trim()) throw new BadRequestException('controller name is required');
    return this.commissioning.create(
      {
        mqttServerId: body.mqttServerId,
        targetHost: body.targetHost ?? '',
        name: body.name,
        runtimeArtifactDigest: body.runtimeArtifactDigest,
      },
      commissioningPrincipal(request),
    );
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/confirm-host-key')
  confirmCommissioningHostKey(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      hostKeyFingerprint?: string;
      trustMethod?: 'trusted_inventory' | 'isolated_service_connection';
      physicalIdentityConfirmed?: boolean;
    },
  ) {
    if (!body?.hostKeyFingerprint) throw new BadRequestException('SSH host-key fingerprint is required');
    return this.commissioning.confirmHostKey(
      id,
      body.hostKeyFingerprint,
      body.trustMethod,
      body.physicalIdentityConfirmed,
    );
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/deliver')
  deliverCommissioningSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CommissioningAttemptInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commissioning.deliver(
      id,
      validateCommissioningAttempt(body, 'installation'),
      commissioningPrincipal(request),
    );
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/recover')
  recoverCommissioningSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CommissioningAttemptInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commissioning.recover(
      id,
      validateCommissioningAttempt(body, 'recovery'),
      commissioningPrincipal(request),
    );
  }
  @Auth('system.settings.manage')
  @Get('commissioning/sessions/:id/verification')
  commissioningVerification(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.verification(id);
  }
  @Auth('system.settings.manage')
  @Get('commissioning/sessions/:id/management')
  managementStatus(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.managementStatus(id);
  }
  @Auth('system.settings.manage')
  @Get('commissioning/sessions/:id/operation')
  operationStatus(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.operationStatus(id);
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/operation/recover')
  recoverOperation(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Parameters<WagoCommissioningService['recoverOperation']>[1],
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commissioning.recoverOperation(id, body ?? {}, commissioningPrincipal(request));
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/platform/:action')
  platformAction(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @Body() body: Parameters<WagoCommissioningService['platform']>[2],
    @Req() request: AuthenticatedRequest,
  ) {
    if (!['inspect', 'activate', 'recover'].includes(action)) throw new BadRequestException('Unknown platform action');
    return this.commissioning.platform(
      id,
      action as Parameters<WagoCommissioningService['platform']>[1],
      body ?? {},
      commissioningPrincipal(request),
    );
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/management/:action')
  manageSecurity(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @Body() body: Parameters<WagoCommissioningService['manageSecurity']>[2],
    @Req() request: AuthenticatedRequest,
  ) {
    if (!['inspect', 'review', 'apply', 'recover'].includes(action))
      throw new BadRequestException('Unknown management action');
    return this.commissioning.manageSecurity(
      id,
      action as Parameters<WagoCommissioningService['manageSecurity']>[1],
      body ?? {},
      commissioningPrincipal(request),
    );
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/revoke')
  revokeCommissioningSession(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.revoke(id);
  }
  @Auth('system.settings.manage')
  @Delete('commissioning/sessions/:id')
  async removeCommissioningSession(@Param('id', ParseIntPipe) id: number) {
    await this.commissioning.remove(id);
  }
  @Post('controllers/:id/claim') claim(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; verifier?: string; mqttServerId?: number },
  ) {
    return this.wago.claim(id, body?.name ?? '', body?.verifier ?? '', body?.mqttServerId);
  }
  @Delete('controllers/:id') async removeController(@Param('id', ParseIntPipe) id: number) {
    await this.commissioning.removeControllerSafely(id, (assertOwned) => this.wago.remove(id, assertOwned));
  }
  @Get('controllers/:id/configuration/draft') draft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.getDraft(id);
  }
  @Get('configuration/presets') presets() {
    return this.wago.presets();
  }
  @Post('controllers/:id/configuration/presets/preview') previewPreset(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { application?: WagoPresetApplication },
  ) {
    if (!body?.application) throw new BadRequestException('application is required');
    return this.wago.previewPreset(id, body.application);
  }
  @Post('controllers/:id/configuration/presets/apply') applyPreset(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { application?: WagoPresetApplication; selectedPaths?: string[]; previewedDraftHash?: string },
  ) {
    if (!body?.application) throw new BadRequestException('application is required');
    return this.wago.applyPreset(id, body.application, body.selectedPaths ?? [], body.previewedDraftHash ?? '');
  }
  @Post('controllers/:id/configuration/draft') saveDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { snapshot?: unknown },
  ) {
    return this.wago.saveDraft(id, body?.snapshot);
  }
  @Post('controllers/:id/configuration/validate') validateDraft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.validateDraft(id);
  }
  @Post('controllers/:id/configuration/review') reviewDraft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.reviewDraft(id);
  }
  @Get('controllers/:id/configuration/revisions') revisions(
    @Param('id', ParseIntPipe) id: number,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.wago.revisionsFor(id, Number(offset), Number(limit));
  }
  @Post('controllers/:id/configuration/publish') publishDraft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.publishDraft(id);
  }
  @Post('controllers/:id/configuration/rollback/:revision') rollback(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
  ) {
    return this.wago.rollback(id, revision);
  }
  @Get('controllers/:id/configuration/revisions/:revision/preview') previewRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
  ) {
    return this.wago.previewRevision(id, revision);
  }
}
