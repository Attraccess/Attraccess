import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CompanionSocket } from './companion.types';

@Injectable()
export class CompanionAuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<CompanionSocket>();
    return client.deviceId !== null;
  }
}
