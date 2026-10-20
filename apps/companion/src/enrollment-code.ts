import { randomInt } from 'node:crypto';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function createEnrollmentCode(): string {
  const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
/** Main-process-owned, monotonic rotation; neither renderer nor server selects codes. */
export class EnrollmentCodeRotation {
  private timer?: NodeJS.Timeout;
  private rotatedAt = 0;
  private code = '';
  start(publish: (code: string) => void): void {
    this.stop();
    const rotate = () => {
      this.code = createEnrollmentCode();
      this.rotatedAt = performance.now();
      publish(this.code);
    };
    rotate();
    this.timer = setInterval(() => {
      if (performance.now() - this.rotatedAt >= 30_000) rotate();
    }, 250);
    this.timer.unref?.();
  }
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.code = '';
  }
}
