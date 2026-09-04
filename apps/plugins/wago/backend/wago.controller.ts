import { BadRequestException, Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import type { WagoPresetApplication } from './configuration';

@Auth('resources.update')
@Controller('wago')
export class WagoControllerApi {
  constructor(@Inject(WagoService) private readonly wago: WagoService) {}
  @Get('controllers') list() {
    return this.wago.list();
  }
  @Get('settings') settings() {
    return this.wago.getSettings();
  }
  @Post('settings') setSettings(@Body() body: { defaultMqttServerId?: number | null; operationalPrefix?: string }) {
    return this.wago.setSettings(body?.defaultMqttServerId, body?.operationalPrefix);
  }
  @Post('enrollments') enrollment(
    @Body() body: { hardwareId?: string; mqttServerId?: number; manualUsername?: string; manualPassword?: string },
  ) {
    const manualCredentials =
      body?.manualUsername || body?.manualPassword
        ? { username: body.manualUsername ?? '', password: body.manualPassword ?? '' }
        : undefined;
    return this.wago.createEnrollment(body?.hardwareId ?? '', body?.mqttServerId, manualCredentials);
  }
  @Get('enrollments/credential-support/:mqttServerId') credentialSupport(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
  ) {
    return this.wago.enrollmentCredentialSupport(mqttServerId);
  }
  @Post('controllers/:id/claim') claim(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; verifier?: string; mqttServerId?: number },
  ) {
    return this.wago.claim(id, body?.name ?? '', body?.verifier ?? '', body?.mqttServerId);
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
