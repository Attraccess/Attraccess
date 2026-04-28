// Module bundling the rate-limit service, interceptor, and DI wiring
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RateLimitService } from './rate-limit.service';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  imports: [SettingsModule],
  providers: [RateLimitService, RateLimitInterceptor, RateLimitGuard],
  exports: [RateLimitService, RateLimitInterceptor, RateLimitGuard],
})
export class RateLimitModule {}
