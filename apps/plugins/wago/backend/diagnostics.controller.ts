import { Controller, Get, Inject, Param, ParseIntPipe } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { WagoDiagnosticsService } from './diagnostics.service';

@Auth('resources.update')
@Controller('wago')
export class WagoDiagnosticsController {
  constructor(@Inject(WagoDiagnosticsService) private readonly diagnostics: WagoDiagnosticsService) {}
  @Get('controllers/:id/diagnostics')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.diagnostics.get(id);
  }
}
