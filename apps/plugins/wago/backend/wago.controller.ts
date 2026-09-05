import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoPresetApplication } from './configuration';

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
  @Get('settings') settings() {
    return this.wago.getSettings();
  }
  @Auth('system.settings.manage')
  @Post('settings') setSettings(@Body() body: { defaultMqttServerId?: number | null; operationalPrefix?: string }) {
    return this.wago.setSettings(body?.defaultMqttServerId, body?.operationalPrefix);
  }
  @Auth('system.settings.manage')
  @Get('commissioning/support') commissioningSupport() {
    return this.commissioning.support();
  }
  @Auth('system.settings.manage')
  @Get('commissioning/sessions') commissioningSessions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.commissioning.list(Number(limit), Number(offset));
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions') createCommissioningSession(
    @Body() body: { mqttServerId?: number; targetHost?: string; name?: string },
  ) {
    if (!body?.mqttServerId) throw new BadRequestException('MQTT server is required');
    if (!body.name?.trim()) throw new BadRequestException('controller name is required');
    return this.commissioning.create({
      mqttServerId: body.mqttServerId,
      targetHost: body.targetHost ?? '',
      name: body.name,
    });
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/confirm-host-key') confirmCommissioningHostKey(@Param('id', ParseIntPipe) id: number, @Body() body: { hostKeyFingerprint?: string }) {
    if (!body?.hostKeyFingerprint) throw new BadRequestException('SSH host-key fingerprint is required');
    return this.commissioning.confirmHostKey(id, body.hostKeyFingerprint);
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/deliver') deliverCommissioningSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { confirmInstall?: boolean; temporarySsh?: { username?: string; password?: string } },
  ) {
    if (body?.confirmInstall !== true) throw new BadRequestException('Explicit installation consent is required');
    if (typeof body.temporarySsh?.username !== 'string' || !body.temporarySsh.username.trim() ||
        typeof body.temporarySsh.password !== 'string' || !body.temporarySsh.password) {
      throw new BadRequestException('Temporary SSH username and password are required');
    }
    return this.commissioning.deliver(id, {
      confirmInstall: true,
      temporarySsh: { username: body.temporarySsh.username, password: body.temporarySsh.password },
    });
  }
  @Auth('system.settings.manage')
  @Post('commissioning/sessions/:id/revoke') revokeCommissioningSession(@Param('id', ParseIntPipe) id: number) {
    return this.commissioning.revoke(id);
  }
  @Auth('system.settings.manage')
  @Delete('commissioning/sessions/:id') async removeCommissioningSession(@Param('id', ParseIntPipe) id: number) {
    await this.commissioning.remove(id);
  }
  @Post('controllers/:id/claim') claim(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; verifier?: string; mqttServerId?: number },
  ) {
    return this.wago.claim(id, body?.name ?? '', body?.verifier ?? '', body?.mqttServerId);
  }
  @Delete('controllers/:id') async removeController(@Param('id', ParseIntPipe) id: number) {
    const hardwareId = await this.wago.remove(id);
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
