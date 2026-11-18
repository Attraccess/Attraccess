import { Injectable, Logger } from '@nestjs/common';
import { EfuseReportService } from './efuse-report.service';
import { IdentityUpgradeService, type IdentityUpgradeSession, type UpgradeMode } from './identity-upgrade.service';
import type { SessionConnection } from './session-connection';
import { FrameType } from './session-framing';
import type { SessionSecurityState } from './session-security-state';

/** The reader->server CONTROL messages. Anything else is a protocol violation and ends the session. */
export const READER_CONTROL_TYPES = ['identity.upgrade.request', 'identity.upgrade', 'efuse.report'] as const;
type ReaderControlType = (typeof READER_CONTROL_TYPES)[number];

const MAX_EFUSE_REPORTS_PER_SESSION = 3;
/** An upgrade-only (recovery) session has nothing else to do and does not linger. */
const RECOVERY_SESSION_MS = 30_000;

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
 * Handles what a reader sends on the session's control channel. Messages of one session run one after the
 * other, so a nonce cannot be spent twice by racing messages.
 */
@Injectable()
export class ReaderControlService {
  private readonly logger = new Logger(ReaderControlService.name);

  public constructor(
    private readonly upgrades: IdentityUpgradeService,
    private readonly efuse: EfuseReportService,
  ) {}

  public attach(connection: SessionConnection, state: SessionSecurityState, mode: UpgradeMode = 'session'): void {
    const upgrade = this.upgrades.createSession(state, mode);
    let reports = 0;
    let queue: Promise<void> = Promise.resolve();
    if (mode === 'recovery') setTimeout(() => connection.close(), RECOVERY_SESSION_MS).unref();

    connection.on('control', (payload: Buffer) => {
      const message = parseReaderControl(payload);
      if (!message || (mode === 'recovery' && message.t === 'efuse.report')) return connection.close();
      if (message.t === 'efuse.report' && ++reports > MAX_EFUSE_REPORTS_PER_SESSION) return connection.close();
      queue = queue
        .then(() => this.dispatch(connection, state, upgrade, message))
        .catch((error: Error) => {
          // Never log the message: it may hold a proof or a public key.
          this.logger.warn(`Reader control message failed: ${error.message}`);
          connection.close();
        });
    });
  }

  private async dispatch(
    connection: SessionConnection,
    state: SessionSecurityState,
    upgrade: IdentityUpgradeSession,
    message: { t: ReaderControlType; body: Record<string, unknown> },
  ): Promise<void> {
    if (message.t === 'efuse.report') {
      if ((await this.efuse.handle(state, message.body)) === 'protocol-violation') connection.close();
      return;
    }
    const reply =
      message.t === 'identity.upgrade.request'
        ? await upgrade.handleRequest()
        : await upgrade.handleUpgrade(message.body);
    if (reply === 'violation') return connection.close();
    connection.sendFrame(FrameType.CONTROL, Buffer.from(JSON.stringify(reply), 'utf8'));
    // The old key is no credential any more: its session ends once the reply had time to leave (the reader reconnects).
    if (reply['t'] === 'identity.upgraded') setTimeout(() => connection.close(), 1000).unref();
  }
}
