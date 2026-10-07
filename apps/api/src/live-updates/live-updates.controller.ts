import { createHash } from 'node:crypto';
import { Body, Controller, HttpCode, Param, Put, Req, Sse, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthenticatedRequest, AuthenticatedUser, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { LiveUpdatesService } from './live-updates.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';

@ApiExcludeController()
@Controller('live-updates')
@SessionAuth()
export class LiveUpdatesController {
  constructor(
    private readonly live: LiveUpdatesService,
    private readonly sse: SseInstrumentation,
  ) {}

  @Sse(':id/events')
  stream(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.sse.wrap('live_updates', this.live.open(id, this.sessionPrincipal(request)));
  }

  @Put(':id/subscriptions')
  @HttpCode(204)
  update(@Param('id') id: string, @Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.live.update(id, this.sessionPrincipal(request), body);
  }

  private sessionPrincipal(request: AuthenticatedRequest): AuthenticatedUser {
    // Session stores return a User, without jwtTokenId. Bind to the actual
    // authenticated credential, retaining only its hash in the connection.
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : request.cookies?.['auth-session'];
    if (!token) throw new UnauthorizedException('Session credential required');
    return { ...request.user, jwtTokenId: createHash('sha256').update(token).digest('hex') };
  }
}
