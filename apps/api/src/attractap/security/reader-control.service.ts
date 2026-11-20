import { Injectable, Logger } from '@nestjs/common';
import { EfuseReportService } from './efuse-report.service';
import type { SessionConnection } from './session-connection';
import type { SessionSecurityState } from './session-security-state';

/** The reader->server CONTROL messages. Anything else is a protocol violation and ends the session. */
export const READER_CONTROL_TYPES = ['efuse.report'] as const;
type ReaderControlType = (typeof READER_CONTROL_TYPES)[number];

const MAX_EFUSE_REPORTS_PER_SESSION = 3;

export function parseReaderControl(payload: Buffer): { t: ReaderControlType; body: Record<string, unknown> } | null {
  try {
    const body = JSON.parse(payload.toString('utf8')) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const t = (body as Record<string, unknown>)['t'];
    return READER_CONTROL_TYPES.includes(t as ReaderControlType)
      ? { t: t as ReaderControlType, body: body as Record<string, unknown> }
      : null;
  } catch {
    return null;
  }
}

/**
 * Handles what a reader sends on the session's control channel. Messages of one session run one after the other.
 */
@Injectable()
export class ReaderControlService {
  private readonly logger = new Logger(ReaderControlService.name);

  public constructor(private readonly efuse: EfuseReportService) {}

  public attach(connection: SessionConnection, state: SessionSecurityState): void {
    let reports = 0;
    let queue: Promise<void> = Promise.resolve();

    connection.on('control', (payload: Buffer) => {
      const message = parseReaderControl(payload);
      if (!message) return connection.close();
      if (++reports > MAX_EFUSE_REPORTS_PER_SESSION) return connection.close();
      queue = queue
        .then(async () => {
          if ((await this.efuse.handle(state, message.body)) === 'protocol-violation') connection.close();
        })
        .catch((error: Error) => {
          // Never log the message: it carries the reader's eFuse report.
          this.logger.warn(`Reader control message failed: ${error.message}`);
          connection.close();
        });
    });
  }
}
