export class CumulativeCounter {
  private previous?: number;
  private total = 0;
  update(raw: number, modulus?: number): number {
    if (!Number.isFinite(raw) || raw < 0 || (modulus !== undefined && raw >= modulus))
      throw new Error('invalid cumulative counter');
    if (this.previous === undefined) this.total = raw;
    else if (raw < this.previous) {
      if (modulus === undefined) throw new Error('cumulative counter decreased without documented rollover');
      // Accept only a boundary crossing; a reset in the middle of the range remains a fault.
      if (this.previous < modulus * 0.9 || raw > modulus * 0.1) throw new Error('counter reset is not a rollover');
      this.total += modulus - this.previous + raw;
    } else this.total += raw - this.previous;
    this.previous = raw;
    if (!Number.isFinite(this.total) || Math.abs(this.total) > Number.MAX_SAFE_INTEGER)
      throw new Error('cumulative counter overflow');
    return this.total;
  }
}
