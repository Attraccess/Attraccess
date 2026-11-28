import { ATTRACTAP_FIRMWARE_PROFILES, type AttractapFirmwareProfile } from '@attraccess/application-models';

/** What a reader claims about its own build in READER_FIRMWARE_INFO. A claim, never attestation. */
export interface ReportedBuild {
  profile: AttractapFirmwareProfile | null;
  release: boolean;
  variant: string | null;
  secureVersion: number | null;
}

const MAX_SECURE_VERSION = 0xffff;
/** How long the eFuse report waits for READER_FIRMWARE_INFO. */
export const FIRMWARE_INFO_WAIT_MS = 5_000;

export function parseReportedBuild(payload: unknown): ReportedBuild {
  const p = (payload ?? {}) as Record<string, unknown>;
  const profile = ATTRACTAP_FIRMWARE_PROFILES.find((candidate) => candidate === p['profile']) ?? null;
  const secureVersion = p['secureVersion'];
  return {
    profile,
    release: p['release'] === true,
    variant: typeof p['variant'] === 'string' ? p['variant'].slice(0, 64) : null,
    secureVersion:
      typeof secureVersion === 'number' &&
      Number.isInteger(secureVersion) &&
      secureVersion >= 0 &&
      secureVersion <= MAX_SECURE_VERSION
        ? secureVersion
        : null,
  };
}

/**
 * Per session facts about the reader's credential and its reported build. The eFuse report arrives on the
 * control channel right after READER_FIRMWARE_INFO is sent on the application channel; the two are handled
 * independently, so a report waits (briefly) until the firmware info was processed.
 */
export class SessionSecurityState {
  private build: ReportedBuild | null = null;
  /** The firmware announced `capabilities.secureConversion` (ATT-1208) in READER_FIRMWARE_INFO. */
  public secureConversion = false;
  /** The firmware was built with stop-before-burn (lab/HIL only) and refuses every burn command. */
  public conversionStopBeforeBurn = false;
  /** Firmware name, variant and version from READER_FIRMWARE_INFO; null until it arrived. */
  public firmware: { name: string; variant: string; version: string } | null = null;
  private waiters: Array<(build: ReportedBuild | null) => void> = [];

  public constructor(
    public readonly readerId: number,
    /** SHA-256 hex of the SPKI this session authenticated with. */
    public readonly fingerprint: string,
  ) {}

  public setBuild(build: ReportedBuild): void {
    this.build = build;
    const waiting = this.waiters;
    this.waiters = [];
    waiting.forEach((resolve) => resolve(build));
  }

  /** The build reported so far, without waiting. */
  public get reportedBuild(): ReportedBuild | null {
    return this.build;
  }

  public whenBuild(timeoutMs: number): Promise<ReportedBuild | null> {
    if (this.build) return Promise.resolve(this.build);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve(null);
      }, timeoutMs);
      timer.unref();
      const done = (build: ReportedBuild | null) => {
        clearTimeout(timer);
        resolve(build);
      };
      this.waiters.push(done);
    });
  }
}
