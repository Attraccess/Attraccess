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
          `heapFree=${report.heapFreeBytes ?? 'n/a'} largestBlock=${report.largestFreeBlockBytes ?? 'n/a'} ` +
          `uptimeMs=${report.uptimeBeforeResetMs ?? 'n/a'} ws=${report.wsState ?? 'n/a'} wifi=${report.wifiState ?? 'n/a'}`,
      );
      this.metricsService.attractapCrashReportsTotal.inc();
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
}
