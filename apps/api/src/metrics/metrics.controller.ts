import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ApiExcludeController } from '@nestjs/swagger';
import { MetricsGuard } from './metrics.guard';

@ApiExcludeController()
@Controller('metrics')
@UseGuards(MetricsGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
