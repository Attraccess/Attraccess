import { Logger } from '@nestjs/common';

const SUMMARY_WINDOW_MS = 60_000;
const REFUSAL = 'token sign-in no longer supported, the reader has to pair';

/**
 * Logs the refused upgrades of readers with token sign-in without flooding the log. A token-only reader retries every
 * 10–60 s until it is flashed over USB, and any client without a subprotocol is refused the same way. The first
 * refusal is logged right away; the ones after it are counted and logged as one summary line per window. A window
 * without refusals ends the summary, so the next refusal is logged right away again. Nothing of the request is logged.
 */
export class RefusedUpgradeLog {
  private timer: NodeJS.Timeout | null = null;
  private counted = 0;

  public constructor(
    private readonly logger: Pick<Logger, 'warn'> = new Logger('AttractapUpgrade'),
    private readonly windowMs = SUMMARY_WINDOW_MS,
  ) {}

  public note(): void {
    if (this.timer) {
      this.counted++;
      return;
    }
    this.logger.warn(`Refused a reader connection: ${REFUSAL}`);
    this.startWindow();
  }

  /** Drops the pending summary and its timer. */
  public reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.counted = 0;
  }

  private startWindow(): void {
    // One-shot and unref'd: the timer exists only while refusals arrive and never keeps the process alive.
    this.timer = setTimeout(() => this.flush(), this.windowMs);
    this.timer.unref();
  }

  private flush(): void {
    this.timer = null;
    const count = this.counted;
    if (count === 0) return;
    this.counted = 0;
    const seconds = Math.round(this.windowMs / 1000);
    this.logger.warn(`Refused ${count} more reader connection(s) in the last ${seconds} s: ${REFUSAL}`);
    this.startWindow();
  }
}
