import { Injectable, Logger } from '@nestjs/common';
import { CONVERSION_MESSAGE_TYPES, parseConversionMessage } from '../secure-conversion/conversion-messages';
import { ConversionProtocolService } from '../secure-conversion/conversion-protocol.service';
import { ConversionSessionRegistry, type ConversionSession } from '../secure-conversion/conversion-session-registry';
import { EfuseReportService } from './efuse-report.service';
import type { SessionConnection } from './session-connection';
import { FrameType } from './session-framing';
import type { SessionSecurityState } from './session-security-state';

/** The reader->server CONTROL messages. Anything else is a protocol violation and ends the session. */
export const READER_CONTROL_TYPES = ['efuse.report', ...CONVERSION_MESSAGE_TYPES] as const;
type ReaderControlType = (typeof READER_CONTROL_TYPES)[number];

const MAX_EFUSE_REPORTS_PER_SESSION = 3;
/** A conversion needs a handful of messages per session; more is a misbehaving reader. */
const MAX_CONVERSION_MESSAGES_PER_SESSION = 64;

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
 * Registers the session as online for the secure conversion while it lasts.
 */
@Injectable()
export class ReaderControlService {
  private readonly logger = new Logger(ReaderControlService.name);

  public constructor(
    private readonly efuse: EfuseReportService,
    private readonly registry: ConversionSessionRegistry,
    private readonly conversion: ConversionProtocolService,
  ) {}

  public attach(connection: SessionConnection, state: SessionSecurityState): void {
    let reports = 0;
    let conversionMessages = 0;
    let queue: Promise<void> = Promise.resolve();
    const run = (work: () => Promise<void>) => {
      queue = queue.then(work).catch((error: Error) => {
        // Never log the message: it carries the reader's eFuse or preflight report.
        this.logger.warn(`Reader control message failed: ${error.message}`);
        connection.close();
      });
    };

    const session: ConversionSession = {
      state,
      send: (message) => connection.sendFrame(FrameType.CONTROL, Buffer.from(JSON.stringify(message), 'utf8')),
    };
    this.registry.register(session);
    connection.once('closed', () => {
      if (this.registry.unregister(session)) run(() => this.conversion.onSessionClosed(state.readerId));
    });

    connection.on('control', (payload: Buffer) => {
      const message = parseReaderControl(payload);
      if (!message) return connection.close();
      if (message.t === 'efuse.report') {
        if (++reports > MAX_EFUSE_REPORTS_PER_SESSION) return connection.close();
        return run(async () => {
          const outcome = await this.efuse.handle(state, message.body);
          if (outcome === 'protocol-violation') return connection.close();
          if (outcome === 'recorded') await this.conversion.onEfuseReportChecked(state.readerId);
        });
      }
      if (++conversionMessages > MAX_CONVERSION_MESSAGES_PER_SESSION) return connection.close();
      const parsed = parseConversionMessage(message.body);
      if (!parsed) return connection.close();
      run(() => this.conversion.handle(session, parsed));
    });
  }
}
