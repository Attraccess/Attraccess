import { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { BrowserOriginPolicy } from './browser-origin-policy';
import { DeviceEnrollmentService } from '../../device-enrollment/device-enrollment.service';
import { ENROLLMENT_LIMITS } from '../../device-enrollment/enrollment-limits';

export class DeviceWebSocketAdapter extends WsAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly enrollment: DeviceEnrollmentService,
    private readonly origins: BrowserOriginPolicy,
  ) {
    super(app);
  }

  create(port: number, options: Parameters<WsAdapter['create']>[1] = {}) {
    const type =
      options.path === '/api/attractap/websocket'
        ? 'reader'
        : options.path === '/api/companion/websocket'
          ? 'companion'
          : undefined;
    if (!type) return super.create(port, options);
    const server: WebSocketServer = super.create(port, {
      ...options,
      // Bound fragmented messages before JSON parsing and before a pending socket can allocate a large frame.
      maxPayload: ENROLLMENT_LIMITS.frameBytes,
      verifyClient: (info: { req: IncomingMessage }, done: (ok: boolean, status?: number) => void) => {
        const origin = info.req.headers.origin;
        if (!origin) return done(true);
        void this.origins.allows(origin).then(
          (allowed) => done(allowed, 403),
          () => done(false, 403),
        );
      },
    });
    server.prependListener('connection', (socket: WebSocket, request: IncomingMessage) => {
      try {
        this.enrollment.admit(socket, type, request.socket.remoteAddress ?? 'unknown');
        socket.once('close', () => this.enrollment.disconnect(socket));
      } catch {
        socket.close(1008, 'Device enrollment admission denied');
      }
    });
    return server;
  }
}
