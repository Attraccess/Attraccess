import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SettingsService } from '../settings/settings.service';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly settingsService: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { value: apiKey, configured } = await this.settingsService.getMetricsApiKey();

    if (!configured || !apiKey) {
      throw new ForbiddenException('Metrics endpoint is disabled. Configure an API key in system settings.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = this.extractApiKey(request);

    if (!providedKey) {
      throw new UnauthorizedException('Missing metrics API key. Provide via Authorization: Bearer <key> header or api_key query parameter.');
    }

    if (!this.secureCompare(providedKey, apiKey)) {
      throw new UnauthorizedException('Invalid metrics API key.');
    }

    return true;
  }

  private extractApiKey(request: Request): string | null {
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    const queryKey = request.query['api_key'];
    if (typeof queryKey === 'string' && queryKey.length > 0) {
      return queryKey;
    }

    return null;
  }

  private secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
