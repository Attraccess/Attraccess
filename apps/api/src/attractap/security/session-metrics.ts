import { Injectable } from '@nestjs/common';
import { Counter, Gauge } from 'prom-client';
import { MetricsService } from '../../metrics/metrics.service';
import { HandshakeLimiter } from './handshake-limiter';

@Injectable()
export class SessionMetrics {
  public readonly activeSessions: Gauge;
  public readonly handshakeQueueDepth: Gauge;
  public readonly handshakeFailures: Counter<'reason'>;

  public constructor(metrics: MetricsService, limiter: HandshakeLimiter) {
    const registers = [metrics.registry];
    this.activeSessions = new Gauge({
      name: 'attraccess_attractap_sessions_active',
      help: 'Number of open encrypted reader sessions',
      registers,
    });
    this.handshakeQueueDepth = new Gauge({
      name: 'attraccess_attractap_handshake_queue_depth',
      help: 'Reader TLS handshakes waiting for a free slot',
      registers,
      collect() {
        this.set(limiter.queueDepth);
      },
    });
    this.handshakeFailures = new Counter({
      name: 'attraccess_attractap_handshake_failures_total',
      help: 'Failed reader session handshakes by reason',
      labelNames: ['reason'],
      registers,
    });
  }
}
