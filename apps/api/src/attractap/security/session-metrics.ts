import { Injectable } from '@nestjs/common';
import { Counter, Gauge } from 'prom-client';
import { createAttractapSessionMetrics } from '../../metrics/definitions/attractap-session.metrics';
import { MetricsService } from '../../metrics/metrics.service';
import { HandshakeLimiter } from './handshake-limiter';

/** The session metrics, bound to this process's handshake limiter. */
@Injectable()
export class SessionMetrics {
  public readonly activeSessions: Gauge;
  public readonly handshakeQueueDepth: Gauge;
  public readonly handshakeFailures: Counter<'reason'>;

  public constructor(metrics: MetricsService, limiter: HandshakeLimiter) {
    const definitions = createAttractapSessionMetrics(metrics.registry, () => limiter.queueDepth);
    this.activeSessions = definitions.activeSessions;
    this.handshakeQueueDepth = definitions.handshakeQueueDepth;
    this.handshakeFailures = definitions.handshakeFailures;
  }
}
