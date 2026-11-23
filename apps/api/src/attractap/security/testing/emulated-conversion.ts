import { createHash } from 'crypto';

/** Faults the emulated reader can inject into a conversion. */
export interface ConversionFaults {
  /** Stop answering (as if the connection dropped) after this many chunk requests in total. */
  disconnectAfterChunks?: number;
  /** Report a failed verification. */
  verifyFails?: boolean;
  /** Read back different digests after the burn. */
  digestMismatch?: boolean;
  /** Compiled with stop-before-burn: refuse every burn. */
  stopBeforeBurn?: boolean;
  /** Report a wrong bootloader read-back. */
  bootloaderReadbackFails?: boolean;
  /** Preflight reports a 4 MB flash. */
  smallFlash?: boolean;
  /** Secure app: migration fails on first boot. */
  migrationFails?: boolean;
}

export interface EmulatedConversionOptions {
  mac?: string;
  variant?: string;
  partitionTableSha256: string;
  faults?: ConversionFaults;
}

/** What the device wants to send: CONTROL messages and chunk requests (application JSON events). */
export interface ConversionOutput {
  control: Array<Record<string, unknown>>;
  chunkRequests: Array<{ id: number; conversion: 'app' | 'bootloader'; offset: number; length: number }>;
}

interface Offer {
  id: number;
  digest0: string;
  digest1: string;
  app: { size: number; sha256: string };
  bootloader: { size: number; sha256: string };
}

const CHUNK = 4096;
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const empty = (): ConversionOutput => ({ control: [], chunkRequests: [] });

/**
 * The reader side of "Secure this reader", as the firmware plays it (protocol steps 1-8 and 10), with the eFuses,
 * the inactive app slot and the staging region kept in memory. Transport-agnostic: feed it CONTROL messages and
 * chunk answers, send what it returns. `reboot()` plays the bootloader (brick window 2) and the secure app's first
 * boot. Nothing here models the firmware's memory or timing.
 */
export class EmulatedConversionDevice {
  public readonly mac: string;
  public stage:
    'none' | 'transferring' | 'verified' | 'burned' | 'bootloader-written' | 'migrated' | 'migration-failed' = 'none';
  public conversionId: number | null = null;
  public efuse = { key0: null as string | null, key1: null as string | null, burns: 0, rdDisLocked: false };
  public profile: 'plain' | 'secure' = 'plain';
  public offline = false;
  private offer: Offer | null = null;
  private app: Buffer[] = [];
  private bootloader: Buffer[] = [];
  private appBytes = 0;
  private bootloaderBytes = 0;
  private pending: 'app' | 'bootloader' | null = null;
  private chunksServed = 0;
  private readonly faults: ConversionFaults;

  public constructor(private readonly options: EmulatedConversionOptions) {
    this.mac = options.mac ?? 'dc:b4:d9:00:00:01';
    this.faults = { ...options.faults };
  }

  /** Clears a fault, e.g. to let a retry or a reconnect succeed. */
  public clearFault(fault: keyof ConversionFaults): void {
    delete this.faults[fault];
  }

  /** `conversion.status`, sent once per session before the eFuse report. */
  public status(): Record<string, unknown> {
    const base = { t: 'conversion.status', id: this.conversionId, stage: this.stage };
    return this.stage === 'migrated' ? { ...base, rdDisLocked: this.efuse.rdDisLocked } : base;
  }

  /** A new session: nothing is requested until the server offers again (as on the firmware). */
  public reconnect(): void {
    this.offline = false;
    this.pending = null;
  }

  public onControl(message: Record<string, unknown>): ConversionOutput {
    const out = empty();
    if (this.offline) return out;
    const id = message['id'] as number;
    switch (message['t']) {
      case 'conversion.preflight':
        out.control.push(this.preflightReport(id));
        break;
      case 'conversion.offer':
        this.acceptOffer(message as unknown as Offer, out);
        break;
      case 'conversion.burn':
        out.control.push(this.burn(message));
        break;
      case 'conversion.write-bootloader':
        out.control.push(this.writeBootloader(id));
        break;
      case 'conversion.cancel':
        if (this.stage === 'transferring' || this.stage === 'verified') this.wipe();
        break;
    }
    return out;
  }

  public onChunk(data: Buffer): ConversionOutput {
    const out = empty();
    if (this.offline || !this.offer || !this.pending) return out;
    if (this.pending === 'app') {
      this.app.push(data);
      this.appBytes += data.length;
    } else {
      this.bootloader.push(data);
      this.bootloaderBytes += data.length;
    }
    this.pending = null;
    this.next(out);
    return out;
  }

  /** Power cycle after the bootloader write: SB + FE in the bootloader, then the secure app migrates. */
  public reboot(): void {
    if (this.stage !== 'bootloader-written') return;
    this.profile = 'secure';
    if (this.faults.migrationFails) {
      this.stage = 'migration-failed';
      return;
    }
    // Release secure build during a pending conversion: RD_DIS lock after migration (never on secure-lab builds).
    this.efuse.rdDisLocked = true;
    this.stage = 'migrated';
  }

  private wipe(): void {
    this.stage = 'none';
    this.conversionId = null;
    this.offer = null;
    this.app = [];
    this.bootloader = [];
    this.appBytes = 0;
    this.bootloaderBytes = 0;
  }

  private preflightReport(id: number): Record<string, unknown> {
    const key = (index: number) => {
      const digest = index === 0 ? this.efuse.key0 : index === 1 ? this.efuse.key1 : null;
      const purpose = digest ? `SECURE_BOOT_DIGEST${index}` : 'USER';
      return { purpose, used: !!digest, readProtected: false, writeProtected: false };
    };
    return {
      t: 'conversion.preflight-report',
      id,
      chip: 'esp32s3',
      chipRevision: 2,
      flashSize: this.faults.smallFlash ? 4 * 1024 * 1024 : 16 * 1024 * 1024,
      mac: this.mac,
      partitionTableSha256: this.options.partitionTableSha256,
      keys: [0, 1, 2, 3, 4, 5].map(key),
      secureBootEn: false,
      cryptCnt: 0,
      disDownloadManualEncrypt: false,
      jtag: { padDisabled: false, usbDisabled: false },
      heapFree: 120_000,
      heapLargest: 60_000,
      variant: this.options.variant ?? 'touch-v2',
      version: '2.14.0',
      profile: this.profile,
    };
  }

  private acceptOffer(offer: Offer, out: ConversionOutput): void {
    const same =
      this.offer?.id === offer.id &&
      this.offer.app.sha256 === offer.app.sha256 &&
      this.offer.bootloader.sha256 === offer.bootloader.sha256;
    if (!same) {
      this.wipe();
      this.offer = offer;
      this.conversionId = offer.id;
      this.stage = 'transferring';
    }
    if (this.stage === 'verified' || this.stage === 'burned') {
      out.control.push(this.verify());
      return;
    }
    this.next(out);
  }

  /** Requests the next chunk (resuming at the staged offset), or verifies once both images are in. */
  private next(out: ConversionOutput): void {
    const offer = this.offer as Offer;
    if (this.faults.disconnectAfterChunks !== undefined && this.chunksServed >= this.faults.disconnectAfterChunks) {
      this.offline = true;
      delete this.faults.disconnectAfterChunks;
      return;
    }
    const kind =
      this.appBytes < offer.app.size ? 'app' : this.bootloaderBytes < offer.bootloader.size ? 'bootloader' : null;
    if (!kind) {
      out.control.push(this.verify());
      return;
    }
    this.pending = kind;
    this.chunksServed++;
    const offset = kind === 'app' ? this.appBytes : this.bootloaderBytes;
    out.chunkRequests.push({ id: offer.id, conversion: kind, offset, length: CHUNK });
  }

  private verify(): Record<string, unknown> {
    const offer = this.offer as Offer;
    const problems: string[] = [];
    if (sha256(Buffer.concat(this.app)) !== offer.app.sha256) problems.push('app-hash');
    if (sha256(Buffer.concat(this.bootloader)) !== offer.bootloader.sha256) problems.push('bootloader-hash');
    if (this.bootloaderBytes > 0x8000) problems.push('bootloader-size');
    if (this.faults.verifyFails) problems.push('app-signature');
    const ok = problems.length === 0;
    if (ok && this.stage === 'transferring') this.stage = 'verified';
    return { t: 'conversion.verified', id: offer.id, ok, problems };
  }

  private burn(message: Record<string, unknown>): Record<string, unknown> {
    const id = message['id'] as number;
    const refuse = (reason: string) => ({ t: 'conversion.burn-refused', id, reason });
    if (this.faults.stopBeforeBurn) return refuse('stop-before-burn');
    if (message['mac'] !== this.mac) return refuse('mac');
    if (!this.offer || this.offer.id !== id || (this.stage !== 'verified' && this.stage !== 'burned')) {
      return refuse('not-verified');
    }
    if (message['digest0'] !== this.offer.digest0 || message['digest1'] !== this.offer.digest1)
      return refuse('digests');
    // Idempotent: digests already there are not burned again.
    if (this.efuse.key0 !== this.offer.digest0) {
      this.efuse.key0 = this.offer.digest0;
      this.efuse.key1 = this.offer.digest1;
      this.efuse.burns++;
    }
    this.stage = 'burned';
    const readBack = this.faults.digestMismatch ? '0'.repeat(64) : (this.efuse.key0 as string);
    return {
      t: 'conversion.burned',
      id,
      mac: this.mac,
      digest0: readBack,
      digest1: this.efuse.key1,
      key0Purpose: 'SECURE_BOOT_DIGEST0',
      key1Purpose: 'SECURE_BOOT_DIGEST1',
    };
  }

  private writeBootloader(id: number): Record<string, unknown> {
    const verified = this.offer?.id === id && this.efuse.key0 === this.offer.digest0 && this.verify()['ok'] === true;
    if (!verified) return { t: 'conversion.bootloader-written', id, ok: false, sha256: null };
    this.stage = 'bootloader-written';
    const readBack = this.faults.bootloaderReadbackFails ? '1'.repeat(64) : sha256(Buffer.concat(this.bootloader));
    return { t: 'conversion.bootloader-written', id, ok: true, sha256: readBack };
  }
}
