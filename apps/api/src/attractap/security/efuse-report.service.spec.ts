import { FakeReaderStore, makeReader } from '../attractap-fake-stores.test-fixture';
import { EfuseReportService } from './efuse-report.service';
import { DIGEST0, DIGEST1, releaseReport } from './testing/efuse-report.test-fixture';
import { SessionSecurityState, type ReportedBuild } from './session-security-state';

const release: ReportedBuild = { profile: 'secure', release: true, variant: 'attractap-touch-v2', secureVersion: 1 };

describe('EfuseReportService', () => {
  let readers: FakeReaderStore;
  let audit: { record: jest.Mock };
  let service: EfuseReportService;

  beforeEach(() => {
    readers = new FakeReaderStore();
    readers.readers.set(5, makeReader({
        id: 5,
        pairingState: 'paired',
        credentialFingerprint: 'a'.repeat(64),
        secureBootDigest0: DIGEST0,
        secureBootDigest1: DIGEST1,
      }));
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new EfuseReportService(readers, audit);
  });

  const state = (build: ReportedBuild | null, algorithm: 'rsa-3072' | 'ecdsa-p256' = 'rsa-3072') => {
    const s = new SessionSecurityState(5, 'a'.repeat(64), algorithm);
    if (build) s.setBuild(build);
    return s;
  };
  const reader = () => readers.readers.get(5);
  const actions = () => audit.record.mock.calls.map((c) => c[0].action);

  it('writes nothing for a session whose key is no longer the reader credential (revoked or re-paired meanwhile)', async () => {
    const session = state(release);
    const row = makeReader({ id: 5, pairingState: 'revoked', credentialFingerprint: 'a'.repeat(64) });
    readers.readers.set(5, { ...row, secureBootDigest0: DIGEST0, secureBootDigest1: DIGEST1 });
    expect(await service.handle(session, releaseReport())).toBe('ignored');
    expect(reader()).toMatchObject({ secured: false, securityReportProblems: null });
    expect(audit.record).not.toHaveBeenCalled();
    readers.readers.set(5, { ...row, pairingState: 'paired', credentialFingerprint: 'b'.repeat(64) });
    expect(await service.handle(session, releaseReport())).toBe('ignored');
    expect(reader()?.secured).toBe(false);
  });

  it('secures a release secure reader with an RSA identity whose report matches, and audits it once', async () => {
    expect(await service.handle(state(release), releaseReport())).toBe('recorded');
    expect(reader()).toMatchObject({ secured: true, efuseSecureVersion: 1, securityReportProblems: [] });
    expect(reader()?.securedAt).toBeInstanceOf(Date);
    expect(actions()).toEqual(['attractap.reader.secured']);
    expect(audit.record.mock.calls[0][0].details).toEqual({
      fingerprint: 'a'.repeat(64),
      profile: 'secure',
      secureVersion: 1,
      efuseSecureVersion: 1,
    });
    // Another passing report changes nothing and writes no second event.
    const at = reader()?.securedAt;
    await service.handle(state(release), releaseReport());
    expect(reader()?.securedAt).toBe(at);
    expect(actions()).toHaveLength(1);
  });

  it.each<[string, ReportedBuild | null, 'rsa-3072' | 'ecdsa-p256', string]>([
    ['secure-lab', { ...release, profile: 'secure-lab', release: false }, 'rsa-3072', 'profile-not-secure'],
    ['a plain build', { ...release, profile: 'plain' }, 'rsa-3072', 'profile-not-secure'],
    ['a secure build that is not a release build', { ...release, release: false }, 'rsa-3072', 'not-release-build'],
    ['a demo variant', { ...release, variant: 'demo' }, 'rsa-3072', 'demo-or-debug-variant'],
    ['a debug variant', { ...release, variant: 'attractap-touch-v2-debug' }, 'rsa-3072', 'demo-or-debug-variant'],
    ['a P-256 authenticated session', release, 'ecdsa-p256', 'software-identity'],
    ['no firmware info', null, 'rsa-3072', 'firmware-info-missing'],
  ])('never secures %s, whatever the report says', async (_name, build, algorithm, problem) => {
    jest.useFakeTimers({ advanceTimers: true });
    const pending = service.handle(state(build, algorithm), releaseReport());
    await jest.advanceTimersByTimeAsync(6_000);
    await pending;
    jest.useRealTimers();
    expect(reader()?.secured).toBe(false);
    expect(reader()?.securityReportProblems).toContain(problem);
    expect(actions()).toEqual([]);
  });

  it('puts a secured reader whose later report fails back to not secured, records the problems and audits it', async () => {
    await service.handle(state(release), releaseReport());
    await service.handle(state(release), releaseReport({ rdDisWriteProtected: false, secureVersion: 0 }));
    expect(reader()).toMatchObject({
      secured: false,
      securedAt: null,
      efuseSecureVersion: 0,
      securityReportProblems: ['rd-dis-writable', 'secure-version-below-floor'],
    });
    expect(actions()).toEqual(['attractap.reader.secured', 'attractap.reader.security_check_failed']);
    expect(audit.record.mock.calls[1][0].details).toEqual({ problems: 'rd-dis-writable,secure-version-below-floor' });
  });

  it('does not trust the digests of the report when the server recorded none for the reader', async () => {
    readers.readers.set(5, makeReader({ id: 5, pairingState: 'paired', credentialFingerprint: 'a'.repeat(64) }));
    await service.handle(state(release), releaseReport());
    expect(reader()?.secured).toBe(false);
    expect(reader()?.securityReportProblems).toEqual(['digest0-not-recorded', 'digest1-not-recorded']);
  });

  it('treats a malformed report as a protocol violation and records nothing', async () => {
    expect(await service.handle(state(release), { keys: [] })).toBe('protocol-violation');
    expect(reader()?.securityReportCheckedAt).toBeNull();
  });

  it('ignores a report from a reader that no longer exists', async () => {
    readers.readers.delete(5);
    expect(await service.handle(state(release), releaseReport())).toBe('ignored');
  });
});
