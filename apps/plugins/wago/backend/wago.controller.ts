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
import { Auth } from '@attraccess/plugins-backend-sdk';
import type { AuthenticatedRequest, PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoPresetApplication, WagoConfigurationSnapshot } from './configuration';
import type { ConfigurationEditorMetadata } from './configuration-editor';
import { WagoAudit, wagoAuditPrincipal } from './wago-audit';

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
  private readonly audit: WagoAudit;
  constructor(
    @Inject(WagoService) private readonly wago: WagoService,
    @Inject(WagoCommissioningService) private readonly commissioning: WagoCommissioningService,
    @Inject(Symbol.for('attraccess.plugin.context')) context: PluginContext,
  ) {
    this.audit = new WagoAudit(context);
  }
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
  createCommissioningSession(@Body() body: { mqttServerId?: number; targetHost?: string; name?: string }) {
    if (!body?.mqttServerId) throw new BadRequestException('MQTT server is required');
    if (!body.name?.trim()) throw new BadRequestException('controller name is required');
    return this.commissioning.create({
      mqttServerId: body.mqttServerId,
      targetHost: body.targetHost ?? '',
      name: body.name,
    });
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/confirm-host-key')
  confirmCommissioningHostKey(@Param('id', ParseIntPipe) id: number, @Body() body: { hostKeyFingerprint?: string }) {
    if (!body?.hostKeyFingerprint) throw new BadRequestException('SSH host-key fingerprint is required');
    return this.commissioning.confirmHostKey(id, body.hostKeyFingerprint);
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/deliver')
  deliverCommissioningSession(@Param('id', ParseIntPipe) id: number, @Body() body: CommissioningAttemptInput) {
    return this.commissioning.deliver(id, validateCommissioningAttempt(body, 'installation'));
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/recover')
  recoverCommissioningSession(@Param('id', ParseIntPipe) id: number, @Body() body: CommissioningAttemptInput) {
    return this.commissioning.recover(id, validateCommissioningAttempt(body, 'recovery'));
  }
  @Auth('system.settings.manage')
  @Get('commissioning/sessions/:id/verification')
  commissioningVerification(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.verification(id);
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
    @Req() request: AuthenticatedRequest,
  ) {
    return this.audit.run(wagoAuditPrincipal(request), id, 'claim', {}, () =>
      this.wago.claim(id, body?.name ?? '', body?.verifier ?? '', body?.mqttServerId),
    );
  }
  @Delete('controllers/:id') async removeController(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    const hardwareId = await this.audit.run(wagoAuditPrincipal(request), id, 'unclaim', {}, () => this.wago.remove(id));
    await this.commissioning.removeByHardwareId(hardwareId);
  }
  @Get('controllers/:id/configuration/draft') draft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.getDraft(id);
  }
  @Get('configuration/presets') presets() {
    return this.wago.presets();
  }
  @Post('controllers/:id/configuration/presets/preview') previewPreset(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { application?: WagoPresetApplication; snapshot?: WagoConfigurationSnapshot },
  ) {
    if (!body?.application) throw new BadRequestException('application is required');
    return this.wago.previewPreset(id, body.application, body.snapshot);
  }
  @Post('controllers/:id/configuration/presets/apply') applyPreset(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      application?: WagoPresetApplication;
      selectedPaths?: string[];
      previewedDraftHash?: string;
      snapshot?: WagoConfigurationSnapshot;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body?.application) throw new BadRequestException('application is required');
    return this.wago.applyPreset(
      id,
      body.application,
      body.selectedPaths ?? [],
      body.previewedDraftHash ?? '',
      body.snapshot,
      wagoAuditPrincipal(request),
    );
  }
  @Post('controllers/:id/configuration/draft') saveDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { snapshot?: unknown; metadata?: ConfigurationEditorMetadata },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.wago.saveDraft(id, body?.snapshot, body?.metadata, wagoAuditPrincipal(request));
  }
  @Post('controllers/:id/configuration/validate') validateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { snapshot?: unknown },
  ) {
    return this.wago.validateDraft(id, body?.snapshot);
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
  @Post('controllers/:id/configuration/publish') publishDraft(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() body?: { force?: boolean; reviewedHash?: string },
  ) {
    return this.wago.publishDraft(id, body?.force === true, body?.reviewedHash, wagoAuditPrincipal(request));
  }
  @Post('controllers/:id/configuration/rollback/:revision') rollback(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
    @Req() request: AuthenticatedRequest,
    @Body() body?: { force?: boolean; sourceHash?: string; currentHash?: string | null; draftHash?: string },
  ) {
    return this.wago.rollback(
      id,
      revision,
      body?.force === true,
      body?.sourceHash,
      body?.currentHash,
      body?.draftHash,
      wagoAuditPrincipal(request),
    );
  }
  @Post('controllers/:id/configuration/revisions/:revision/acknowledge-rejection') acknowledgeRejection(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
    @Req() request: AuthenticatedRequest,
    @Body() body?: { contentHash?: string; reportedAt?: string },
  ) {
    return this.wago.acknowledgeRejection(id, revision, body ?? {}, wagoAuditPrincipal(request));
  }
  @Get('controllers/:id/configuration/revisions/:revision/preview') previewRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
  ) {
    return this.wago.previewRevision(id, revision);
  }
}
