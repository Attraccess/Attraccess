// Module bundling the rate-limit service, interceptor, and DI wiring
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RateLimitService } from './rate-limit.service';
import { RateLimitInterceptor } from './rate-limit.interceptor';

@Module({
  imports: [SettingsModule],
  providers: [RateLimitService, RateLimitInterceptor],
  exports: [RateLimitService, RateLimitInterceptor],
})
export class RateLimitModule {}
