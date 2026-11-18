import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_RECORDER, type AuditRecorder } from '../../audit/recorder/audit-event';
import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from '../reader-store.port';
import { checkEfuseReport, parseEfuseReport } from './efuse-report';
import { SessionSecurityState, isDemoVariant } from './session-security-state';

const BUILD_WAIT_MS = 5_000;

export type EfuseReportOutcome = 'ignored' | 'protocol-violation' | 'recorded';

/**
 * Checks a reader's eFuse report against the release secure profile and keeps the verdict (`secured`).
 * A reader "secured" claim is never read here: only the session's credential and the report count.
 * secure-lab, demo and non-release builds, and readers on a software (P-256) identity, never become secured.
 */
@Injectable()
export class EfuseReportService {
  private readonly logger = new Logger(EfuseReportService.name);

  public constructor(
    @Inject(ATTRACTAP_READER_STORE) private readonly readers: AttractapReaderStore,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  public async handle(session: SessionSecurityState, body: unknown): Promise<EfuseReportOutcome> {
    const report = parseEfuseReport(body);
    if (!report) return 'protocol-violation';
    const reader = await this.readers.findById(session.readerId);
    if (!reader) return 'ignored';
    const build = await session.whenBuild(BUILD_WAIT_MS);

    const problems = [
      ...this.eligibilityProblems(session, build),
      ...checkEfuseReport(report, { digest0: reader.secureBootDigest0, digest1: reader.secureBootDigest1 }),
    ];
    const secured = problems.length === 0;
    const now = new Date();
    const applied = await this.readers.applySecurity(
      reader.id,
      {
        secured,
        securedAt: secured ? (reader.secured ? reader.securedAt : now) : null,
        efuseSecureVersion: report.secureVersion,
        securityReportCheckedAt: now,
        securityReportProblems: problems,
      },
      // The key of this session must still be the reader's credential (a revoke or re-pair may have landed meanwhile).
      session.fingerprint,
    );
    if (!applied) return 'ignored';

    if (secured && !reader.secured) {
      await this.record(reader.id, 'reader.secured', {
        fingerprint: session.fingerprint,
        profile: build?.profile ?? 'secure',
        secureVersion: build?.secureVersion ?? 0,
        efuseSecureVersion: report.secureVersion,
      });
    } else if (!secured && reader.secured) {
      await this.record(reader.id, 'reader.security_check_failed', { problems: problems.join(',').slice(0, 300) });
    }
    return 'recorded';
  }

  private eligibilityProblems(session: SessionSecurityState, build: ReturnType<SessionSecurityState['currentBuild']>) {
    const problems: string[] = [];
    if (!build) return ['firmware-info-missing'];
    if (build.profile !== 'secure') problems.push('profile-not-secure');
    if (!build.release) problems.push('not-release-build');
    if (isDemoVariant(build.variant)) problems.push('demo-or-debug-variant');
    if (session.algorithm !== 'rsa-3072') problems.push('software-identity');
    return problems;
  }

  private async record(
    readerId: number,
    action: 'reader.secured' | 'reader.security_check_failed',
    details: Record<string, string | number | boolean>,
  ): Promise<void> {
    try {
      await this.audit.record({
        domain: 'attractap',
        action: `attractap.${action}` as const,
        actor: { id: null, authenticationMethod: null },
        subject: { type: 'attractap.reader', id: readerId },
        details,
      });
    } catch (error) {
      this.logger.warn(`Audit of ${action} failed: ${(error as Error).message}`);
    }
  }
}
