import { Inject, Injectable } from '@nestjs/common';
import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from '../reader-store.port';
import { checkEfuseReport, parseEfuseReport } from './efuse-report';
import { buildEligibilityProblems } from './secured-eligibility';
import { FIRMWARE_INFO_WAIT_MS, type SessionSecurityState } from './session-security-state';

export type EfuseReportOutcome = 'ignored' | 'protocol-violation' | 'recorded';

/**
 * Checks a reader's eFuse report against the release secure profile and keeps the verdict (`secured`).
 * A reader's own "secured" claim is never read here: only the session's credential and the report count.
 * secure-lab, plain, demo and non-release builds never become secured.
 *
 * Every report is written, also when its verdict did not change: `securityReportCheckedAt` records when the server
 * last checked the reader, and a reader sends one report per session start, so this is one write per connection.
 */
@Injectable()
export class EfuseReportService {
  public constructor(@Inject(ATTRACTAP_READER_STORE) private readonly readers: AttractapReaderStore) {}

  public async handle(session: SessionSecurityState, body: unknown): Promise<EfuseReportOutcome> {
    const report = parseEfuseReport(body);
    if (!report) return 'protocol-violation';
    // The security columns and digests only: the check needs neither the linked resources nor anything else.
    const reader = await this.readers.findSecurity(session.readerId);
    if (!reader) return 'ignored';
    const build = await session.whenBuild(FIRMWARE_INFO_WAIT_MS);

    const problems = [
      ...buildEligibilityProblems(build),
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
    return applied ? 'recorded' : 'ignored';
  }
}
