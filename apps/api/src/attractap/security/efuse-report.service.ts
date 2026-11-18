import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_RECORDER, type AuditRecorder } from '../../audit/recorder/audit-event';
import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from '../reader-store.port';
import { auditProblemList, checkEfuseReport, parseEfuseReport } from './efuse-report';
import { isSecurableBuild, securedEligibilityProblems } from './secured-eligibility';
import { FIRMWARE_INFO_WAIT_MS, type SessionSecurityState } from './session-security-state';

export type EfuseReportOutcome = 'ignored' | 'protocol-violation' | 'recorded';

/**
 * Checks a reader's eFuse report against the release secure profile and keeps the verdict (`secured`).
 * A reader "secured" claim is never read here: only the session's credential and the report count.
 * secure-lab, demo and non-release builds, and readers on a software (P-256) identity, never become secured.
 *
 * Every report is written, also when its verdict did not change: `securityReportCheckedAt` records when the server
 * last checked the reader, and a reader sends one report per session start, so this is one write per connection.
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
    // The security columns and digests only: the check needs neither the linked resources nor anything else.
    const reader = await this.readers.findSecurity(session.readerId);
    if (!reader) return 'ignored';
    const build = await session.whenBuild(FIRMWARE_INFO_WAIT_MS);

    const problems = [
      ...securedEligibilityProblems(build, session.algorithm),
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

    // `secured` implies a securable build; the guard narrows its type for the audit details.
    if (secured && !reader.secured && isSecurableBuild(build)) {
      await this.record(reader.id, 'reader.secured', {
        fingerprint: session.fingerprint,
        profile: build.profile,
        // A build without a reported app secure_version leaves it out rather than claiming one.
        ...(build.secureVersion === null ? {} : { secureVersion: build.secureVersion }),
        efuseSecureVersion: report.secureVersion,
      });
    } else if (!secured && reader.secured) {
      await this.record(reader.id, 'reader.security_check_failed', { problems: auditProblemList(problems) });
    }
    return 'recorded';
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
