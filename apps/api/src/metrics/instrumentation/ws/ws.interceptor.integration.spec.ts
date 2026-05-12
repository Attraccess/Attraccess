// End-to-end check that WsMetricsInterceptor fires via @UseInterceptors on a
// FEATURE: Metrics — WebSocket interceptor wiring verification with real WsAdapter
import { Controller, INestApplication, Module, UseInterceptors } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { WsAdapter } from '@nestjs/platform-ws';
import { Registry } from 'prom-client';
import WebSocket from 'ws';
import { WsMetricsInterceptor } from './ws.interceptor';
import { WS_METRICS } from '../../definitions/tokens';
import { createWsMetrics } from '../../definitions/ws.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

const toggleStub = { isEnabledCached: () => true } as unknown as MetricsToggleService;

@Controller()
class NoopController {}

@WebSocketGateway({ path: '/ws-fixed' })
@UseInterceptors(WsMetricsInterceptor)
class FixedGateway {
  @SubscribeMessage('PING')
  onPing(): { ok: true } {
    return { ok: true };
  }
}

@WebSocketGateway({ path: '/ws-broken' })
class BrokenGateway {
  @SubscribeMessage('PING')
  onPing(): { ok: true } {
    return { ok: true };
  }
}

const fixedRegistry = new Registry();
const brokenRegistry = new Registry();
const fixedWsMetrics = createWsMetrics(fixedRegistry);
const brokenWsMetrics = createWsMetrics(brokenRegistry);

@Module({
  controllers: [NoopController],
  providers: [
    FixedGateway,
    WsMetricsInterceptor,
    { provide: WS_METRICS, useValue: fixedWsMetrics },
    { provide: MetricsToggleService, useValue: toggleStub },
  ],
})
class FixedAppModule {}

@Module({
  controllers: [NoopController],
  providers: [
    BrokenGateway,
    WsMetricsInterceptor,
    { provide: APP_INTERCEPTOR, useClass: WsMetricsInterceptor },
    { provide: WS_METRICS, useValue: brokenWsMetrics },
    { provide: MetricsToggleService, useValue: toggleStub },
  ],
})
class BrokenAppModule {}

async function bootstrap(mod: unknown, path: string): Promise<{ app: INestApplication; url: string }> {
  const app = await NestFactory.create(mod as never, { logger: false });
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen(0);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { app, url: `ws://127.0.0.1:${port}${path}` };
}

async function sendPing(url: string): Promise<void> {
  const client = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 8000);
    client.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    client.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  client.send(JSON.stringify({ event: 'PING', data: {} }));
  await new Promise((r) => setTimeout(r, 500));
  client.close();
}

async function pingCount(registry: Registry): Promise<number> {
  const counter = await registry.getSingleMetric('attraccess_ws_messages_total').get();
  const sample = counter.values.find(
    (v) => v.labels.event === 'PING' && v.labels.status === 'success' && v.labels.gateway === 'attractap',
  );
  return sample ? sample.value : 0;
}

describe('WsMetricsInterceptor (integration)', () => {
  describe('@UseInterceptors on gateway (the fix)', () => {
    let app: INestApplication;
    let url: string;

    beforeAll(async () => {
      ({ app, url } = await bootstrap(FixedAppModule, '/ws-fixed'));
    });

    afterAll(async () => {
      await app.close();
    });

    it('records messagesTotal and messageDuration', async () => {
      await sendPing(url);

      const deadline = Date.now() + 8000;
      let count = 0;
      while (Date.now() < deadline) {
        count = await pingCount(fixedRegistry);
        if (count > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(count).toBeGreaterThan(0);

      const exposition = await fixedRegistry.metrics();
      expect(exposition).toMatch(
        /attraccess_ws_message_duration_seconds_count\{[^}]*event="PING"[^}]*\}\s+[1-9]/,
      );
    }, 20000);
  });

  describe('APP_INTERCEPTOR only (the bug)', () => {
    let app: INestApplication;
    let url: string;

    beforeAll(async () => {
      ({ app, url } = await bootstrap(BrokenAppModule, '/ws-broken'));
    });

    afterAll(async () => {
      await app.close();
    });

    it('does NOT record samples — proves APP_INTERCEPTOR is insufficient for platform-ws', async () => {
      await sendPing(url);
      await new Promise((r) => setTimeout(r, 1000));
      const count = await pingCount(brokenRegistry);
      expect(count).toBe(0);
    }, 20000);
  });
});
