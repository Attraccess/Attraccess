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
  @Post('settings') setSettings(@Body() body: { defaultMqttServerId?: number | null }) {
    return this.wago.setDefaultMqttServer(body?.defaultMqttServerId ?? null);
  }
  @Post('enrollments') enrollment(
    @Body() body: { hardwareId?: string; mqttServerId?: number; manualUsername?: string; manualPassword?: string },
  ) {
    const manualCredentials = body?.manualUsername || body?.manualPassword
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
}
