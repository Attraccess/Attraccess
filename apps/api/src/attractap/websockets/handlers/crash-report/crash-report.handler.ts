import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../../attractap.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { AUDIT_RECORDER, AuditRecorder } from '../../../../audit/recorder/audit-event';
import {
  AuthenticatedWebSocket,
  AttractapEvent,
  AttractapEventType,
  ReaderCoredumpBeginPayload,
  ReaderCoredumpChunkPayload,
  ReaderCoredumpCompletePayload,
  ReaderCrashReportPayload,
} from '../../websocket.types';
import {
  COREDUMP_CHUNK_BYTES,
  COREDUMP_MAX_BYTES,
  CoredumpAssemblies,
  declaredCoredump,
  isUint32,
} from './coredump-assembly';

@Injectable()
export class AttractapCrashReportHandler {
  private readonly logger = new Logger(AttractapCrashReportHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(AUDIT_RECORDER)
  private audit: AuditRecorder;

  private readonly coredumpUploads = new CoredumpAssemblies((readerId, reportId, received) =>
    this.logger.warn(
      `Dropped the stalled coredump upload of reader ${readerId} for crash report ${reportId} after ${received} bytes`,
    ),
  );

  public async handleCrashReport(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const payload = data.payload as ReaderCrashReportPayload;

    if (!payload?.resetReason || typeof payload.resetReason !== 'string') {
      this.logger.error(`READER_CRASH_REPORT from reader ${socket.readerId} missing resetReason; ignoring.`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.READER_CRASH_REPORT, { error: 'INVALID_CRASH_REPORT' }),
      );
      return;
    }

    // Firmware since ATT-1144 announces its dump and uploads it in chunks afterwards. A dump that cannot
    // come from the coredump partition is refused, but the report itself is still worth keeping.
    const hasInlineDump = typeof payload.coredumpBase64 === 'string' && payload.coredumpBase64.length > 0;
    const announced = hasInlineDump ? null : declaredCoredump(payload.coredumpSize, payload.coredumpCrc32);
    let coredumpRejected: string | null = null;
    if (!hasInlineDump && payload.coredumpSize != null && !announced) coredumpRejected = 'INVALID_COREDUMP';
    if (announced && announced.size > COREDUMP_MAX_BYTES) coredumpRejected = 'COREDUMP_TOO_LARGE';
    const expectedCoredump = coredumpRejected ? null : announced;

    try {
      const report = await this.attractapService.createCrashReport(socket.readerId, payload, expectedCoredump);
      await this.audit.record({
        domain: 'attractap',
        action: 'attractap.reader.crash_reported',
        actor: { id: null, authenticationMethod: null },
        subject: { type: 'attractap.reader', id: socket.readerId },
        details: {
          source: 'reader-websocket',
          resetReason: this.normalizeResetReason(report.resetReason),
          // Includes a dump that is still being uploaded: the event is recorded once, at the report.
          hasCoredump: !!report.coredumpSize || report.coredumpStatus === 'awaiting',
        },
      });
      this.logger.warn(
        `Stored crash report ${report.id} for reader ${socket.readerId}: reason=${report.resetReason} ` +
          `rebootReason=${report.rebootReason ?? 'n/a'} ` +
          `heapFree=${report.heapFreeBytes ?? 'n/a'} largestBlock=${report.largestFreeBlockBytes ?? 'n/a'} ` +
          `uptimeMs=${report.uptimeBeforeResetMs ?? 'n/a'} ws=${report.wsState ?? 'n/a'} wifi=${report.wifiState ?? 'n/a'} ` +
          `coredump=${report.coredumpStatus ?? 'none'}${coredumpRejected ? ` (${coredumpRejected})` : ''}`,
      );
      this.metricsService.attractapCrashReportsTotal.inc({
        reader_id: String(socket.readerId),
        reset_reason: this.normalizeResetReason(report.resetReason),
      });
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.READER_CRASH_REPORT, {
          received: true,
          id: report.id,
          ...(report.coredumpStatus === 'awaiting'
            ? { coredumpUpload: { reportId: report.id, chunkSize: COREDUMP_CHUNK_BYTES } }
            : {}),
          ...(coredumpRejected ? { coredumpRejected } : {}),
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to store crash report for reader ${socket.readerId}: ${(error as Error).message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.READER_CRASH_REPORT, { error: 'CRASH_REPORT_STORE_FAILED' }),
      );
    }
  }

  /** Starts, or after a reconnect restarts, the chunked upload of a report's announced dump. */
  public async handleCoredumpBegin(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const payload = (data.payload ?? {}) as Partial<ReaderCoredumpBeginPayload>;
    const reply = (body: Record<string, unknown>) =>
      this.reply(socket, AttractapEventType.READER_COREDUMP_BEGIN, payload.reportId, body);
    const declared = declaredCoredump(payload.size, payload.crc32);
    if (!isUint32(payload.reportId) || !declared) return reply({ error: 'INVALID_COREDUMP' });
    if (declared.size > COREDUMP_MAX_BYTES) return reply({ error: 'COREDUMP_TOO_LARGE' });

    let report;
    try {
      report = await this.attractapService.findCrashReportOfReader(payload.reportId, socket.readerId);
    } catch (error) {
      this.logger.error(`Coredump upload of reader ${socket.readerId} failed: ${(error as Error).message}`);
      return reply({ error: 'CRASH_REPORT_STORE_FAILED' });
    }
    // Another reader's report looks exactly like a missing one.
    if (!report) return reply({ error: 'COREDUMP_REPORT_NOT_FOUND' });
    const isAnnouncedDump =
      report.coredumpExpectedSize === declared.size && report.coredumpExpectedCrc32 === declared.crc32;
    if (report.coredumpStatus === 'stored') {
      // The confirmation of an earlier upload got lost: confirm again instead of storing it twice.
      return reply(isAnnouncedDump ? { coredumpStored: true } : { error: 'COREDUMP_ALREADY_STORED' });
    }
    if (report.coredumpStatus !== 'awaiting') return reply({ error: 'COREDUMP_NOT_EXPECTED' });
    if (!isAnnouncedDump) return reply({ error: 'COREDUMP_MISMATCH' });

    const unfinished = this.coredumpUploads.received(socket.readerId);
    if (unfinished !== null) {
      // The reader reconnected before the server noticed the old connection was gone.
      this.logger.warn(
        `Reader ${socket.readerId} restarts its coredump upload; dropped the unfinished one after ${unfinished} bytes`,
      );
    }
    if (!this.coredumpUploads.begin(socket.id, socket.readerId, report.id, declared)) {
      this.logger.warn(`Too many coredump uploads in progress; reader ${socket.readerId} retries later`);
      return reply({ error: 'COREDUMP_BUSY' });
    }
    this.logger.log(
      `Reader ${socket.readerId} uploads the ${declared.size} byte coredump of crash report ${report.id}`,
    );
    return reply({ chunkSize: COREDUMP_CHUNK_BYTES, nextOffset: 0 });
  }

  /** One chunk at a time: the reply carries the offset the reader sends next. */
  public handleCoredumpChunk(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const payload = (data.payload ?? {}) as Partial<ReaderCoredumpChunkPayload>;
    if (!isUint32(payload.reportId)) {
      return this.reply(socket, AttractapEventType.READER_COREDUMP_CHUNK, undefined, { error: 'COREDUMP_NO_UPLOAD' });
    }
    const result = this.coredumpUploads.append(socket.readerId, payload.reportId, payload.offset, payload.data);
    if ('error' in result && result.error !== 'COREDUMP_OUT_OF_ORDER') {
      this.logger.warn(`Coredump chunk of reader ${socket.readerId} refused: ${result.error}`);
    }
    return this.reply(socket, AttractapEventType.READER_COREDUMP_CHUNK, payload.reportId, { ...result });
  }

  /** Verifies the whole dump, then stores and symbolicates it before confirming. */
  public async handleCoredumpComplete(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const payload = (data.payload ?? {}) as Partial<ReaderCoredumpCompletePayload>;
    const reply = (body: Record<string, unknown>) =>
      this.reply(socket, AttractapEventType.READER_COREDUMP_COMPLETE, payload.reportId, body);
    if (!isUint32(payload.reportId)) return reply({ error: 'COREDUMP_NO_UPLOAD' });

    const result = this.coredumpUploads.finish(socket.readerId, payload.reportId, {
      totalSize: payload.totalSize,
      crc32: payload.crc32,
    });
    if ('error' in result) {
      this.logger.warn(`Coredump upload of reader ${socket.readerId} discarded: ${result.error}`);
      return reply({ error: result.error });
    }

    try {
      const report = await this.attractapService.findCrashReportOfReader(payload.reportId, socket.readerId);
      if (!report) return reply({ error: 'COREDUMP_REPORT_NOT_FOUND' });
      const stored = await this.attractapService.storeUploadedCoredump(report, result.coredump);
      if (!stored && report.coredumpStatus !== 'stored') return reply({ error: 'COREDUMP_NOT_EXPECTED' });
      this.logger.log(
        `Stored the ${result.coredump.length} byte coredump of crash report ${report.id} (reader ${socket.readerId}); ` +
          `symbolication ${report.symbolicationStatus ?? 'n/a'}`,
      );
      return reply({ coredumpStored: true });
    } catch (error) {
      this.logger.error(`Failed to store the coredump of reader ${socket.readerId}: ${(error as Error).message}`);
      return reply({ error: 'CRASH_REPORT_STORE_FAILED' });
    }
  }

  /** The connection closed: a partial upload is discarded (the reader restarts it after reconnecting). */
  public discardCoredumpUpload(socketId: string): void {
    const dropped = this.coredumpUploads.discardSocket(socketId);
    if (dropped) {
      this.logger.warn(
        `Discarded the partial coredump upload of reader ${dropped.readerId} for crash report ${dropped.reportId} ` +
          `after ${dropped.received} bytes: connection closed`,
      );
    }
  }

  /** Upload replies pace the reader's next message themselves, so they skip the ACK round trip. */
  private reply(
    socket: AuthenticatedWebSocket,
    type: AttractapEventType,
    reportId: unknown,
    body: Record<string, unknown>,
  ): void {
    socket.sendRaw(new AttractapEvent(type, { ...(isUint32(reportId) ? { reportId } : {}), ...body }));
  }

  private normalizeResetReason(resetReason?: string | null): string {
    return typeof resetReason === 'string' && RESET_REASONS.has(resetReason) ? resetReason : 'UNKNOWN';
  }
}

const RESET_REASONS = new Set([
  'POWERON',
  'EXT',
  'SW',
  'PANIC',
  'INT_WDT',
  'TASK_WDT',
  'WDT',
  'DEEPSLEEP',
  'BROWNOUT',
  'SDIO',
  'UNKNOWN',
]);
