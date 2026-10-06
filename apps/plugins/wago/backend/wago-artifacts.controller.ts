import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';

@Auth('system.settings.manage')
@Controller('wago/runtime-artifacts')
export class WagoArtifactsController {
  constructor(@Inject(WagoRuntimeArtifactsService) private readonly artifacts: WagoRuntimeArtifactsService) {}
  @Get() async list() {
    try {
      return await this.artifacts.list();
    } catch {
      throw new ServiceUnavailableException('Runtime releases could not be loaded. Retry shortly.');
    }
  }
  @Get('current') async current() {
    try {
      return await this.artifacts.current();
    } catch {
      throw new ServiceUnavailableException('The selected runtime release could not be loaded. Retry shortly.');
    }
  }
}
