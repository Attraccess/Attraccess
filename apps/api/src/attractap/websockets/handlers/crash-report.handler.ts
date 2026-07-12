import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../attractap.service';
import { MetricsService } from '../../../metrics/metrics.service';
import {
  AuthenticatedWebSocket,
  AttractapEvent,
  AttractapEventType,
  ReaderCrashReportPayload,
} from '../websocket.types';

@Injectable()
export class AttractapCrashReportHandler {
  private readonly logger = new Logger(AttractapCrashReportHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  public async handleCrashReport(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const payload = data.payload as ReaderCrashReportPayload;

    if (!payload?.resetReason || typeof payload.resetReason !== 'string') {
      this.logger.error(`READER_CRASH_REPORT from reader ${socket.readerId} missing resetReason; ignoring.`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.READER_CRASH_REPORT, { error: 'INVALID_CRASH_REPORT' }),
      );
      return;
    }

    try {
      const report = await this.attractapService.createCrashReport(socket.readerId, payload);
      this.logger.warn(
        `Stored crash report ${report.id} for reader ${socket.readerId}: reason=${report.resetReason} ` +
          `rebootReason=${report.rebootReason ?? 'n/a'} ` +
          `heapFree=${report.heapFreeBytes ?? 'n/a'} largestBlock=${report.largestFreeBlockBytes ?? 'n/a'} ` +
          `uptimeMs=${report.uptimeBeforeResetMs ?? 'n/a'} ws=${report.wsState ?? 'n/a'} wifi=${report.wifiState ?? 'n/a'}`,
      );
      this.metricsService.attractapCrashReportsTotal.inc({
        reader_id: String(socket.readerId),
        reset_reason: this.normalizeResetReason(report.resetReason),
      });
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.READER_CRASH_REPORT, { received: true, id: report.id }),
      );
    } catch (error) {
      this.logger.error(`Failed to store crash report for reader ${socket.readerId}: ${(error as Error).message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.READER_CRASH_REPORT, { error: 'CRASH_REPORT_STORE_FAILED' }),
      );
    }
  }

  /**
   * Normalize a reader-supplied reset reason into a bounded, low-cardinality
   * label value (uppercase, alphanumeric/underscore only, length-capped).
   * Readers send a fixed enum in practice, but the field is a free string on
   * the wire, so we sanitize defensively to protect Prometheus cardinality.
   */
  private normalizeResetReason(resetReason?: string | null): string {
    if (!resetReason || typeof resetReason !== 'string') {
      return 'unknown';
    }
    const normalized = resetReason
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    return normalized || 'unknown';
  }
}
