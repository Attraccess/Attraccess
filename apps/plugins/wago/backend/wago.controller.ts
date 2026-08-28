import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';

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
    return this.wago.setSettings(body?.defaultMqttServerId ?? null, body?.operationalPrefix);
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
  @Post('controllers/:id/claim') claim(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; verifier?: string; mqttServerId?: number },
  ) {
    return this.wago.claim(id, body?.name ?? '', body?.verifier ?? '', body?.mqttServerId);
  }
  @Get('controllers/:id/configuration/draft') draft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.getDraft(id);
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
  @Get('controllers/:id/configuration/revisions') revisions(@Param('id', ParseIntPipe) id: number) {
    return this.wago.revisionsFor(id);
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
