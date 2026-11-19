import { ATTRACTAP_SECURITY_PROBLEMS } from '@attraccess/application-models';
import { FakeReaderStore, makeReader } from '../attractap-fake-stores.test-fixture';
import { EfuseReportService } from './efuse-report.service';
import { DIGEST0, DIGEST1, releaseReport } from './testing/efuse-report.test-fixture';
import { SessionSecurityState, type ReportedBuild } from './session-security-state';

const release: ReportedBuild = { profile: 'secure', release: true, variant: 'attractap-touch-v2', secureVersion: 1 };

describe('EfuseReportService', () => {
  let readers: FakeReaderStore;
  let service: EfuseReportService;

  beforeEach(() => {
    readers = new FakeReaderStore();
    readers.readers.set(
      5,
      makeReader({
        id: 5,
        pairingState: 'paired',
        credentialFingerprint: 'a'.repeat(64),
        secureBootDigest0: DIGEST0,
        secureBootDigest1: DIGEST1,
      }),
    );
    service = new EfuseReportService(readers);
  });

  const state = (build: ReportedBuild | null) => {
    const s = new SessionSecurityState(5, 'a'.repeat(64));
    if (build) s.setBuild(build);
    return s;
  };
  const reader = () => readers.readers.get(5);

  it('writes nothing for a session whose key is no longer the reader credential (revoked or re-paired meanwhile)', async () => {
    const session = state(release);
    const row = makeReader({ id: 5, pairingState: 'revoked', credentialFingerprint: 'a'.repeat(64) });
    readers.readers.set(5, { ...row, secureBootDigest0: DIGEST0, secureBootDigest1: DIGEST1 });
    expect(await service.handle(session, releaseReport())).toBe('ignored');
    expect(reader()).toMatchObject({ secured: false, securityReportProblems: null });
    readers.readers.set(5, { ...row, pairingState: 'paired', credentialFingerprint: 'b'.repeat(64) });
    expect(await service.handle(session, releaseReport())).toBe('ignored');
    expect(reader()?.secured).toBe(false);
  });

  it('secures a release secure reader whose report matches', async () => {
    expect(await service.handle(state(release), releaseReport())).toBe('recorded');
    expect(reader()).toMatchObject({ secured: true, efuseSecureVersion: 1, securityReportProblems: [] });
    expect(reader()?.securedAt).toBeInstanceOf(Date);
    // Another passing report changes nothing and writes no second event.
    const at = reader()?.securedAt;
    await service.handle(state(release), releaseReport());
    expect(reader()?.securedAt).toBe(at);
  });

  it.each<[string, ReportedBuild | null, string]>([
    ['secure-lab', { ...release, profile: 'secure-lab', release: false }, 'profile-not-secure'],
    ['a plain build', { ...release, profile: 'plain' }, 'profile-not-secure'],
    ['a secure build that is not a release build', { ...release, release: false }, 'not-release-build'],
    ['a demo variant', { ...release, variant: 'demo' }, 'demo-or-debug-variant'],
    ['a debug variant', { ...release, variant: 'attractap-touch-v2-debug' }, 'demo-or-debug-variant'],
    ['no firmware info', null, 'firmware-info-missing'],
  ])('never secures %s, whatever the report says', async (_name, build, problem) => {
    jest.useFakeTimers({ advanceTimers: true });
    const pending = service.handle(state(build), releaseReport());
    await jest.advanceTimersByTimeAsync(6_000);
    await pending;
    jest.useRealTimers();
    expect(reader()?.secured).toBe(false);
    expect(reader()?.securityReportProblems).toContain(problem);
  });

  it('reads only the security columns of the reader, not the reader with its resources', async () => {
    const findById = jest.spyOn(readers, 'findById');
    await service.handle(state(release), releaseReport());
    expect(findById).not.toHaveBeenCalled();
    expect(reader()?.secured).toBe(true);
  });

  it('lists every problem of a report where everything fails', async () => {
    await service.handle(state(release), releaseReport());
    const broken = releaseReport({
      secureBootEn: false,
      keys: releaseReport().keys.map(() => ({ purpose: 'USER', used: false, readProtected: false })),
      digest0: null,
      digest1: null,
      revoke: [true, true, false],
      cryptCnt: 0,
      cryptCntWriteProtected: false,
      flashEncryptionMode: 'disabled',
      disDownloadManualEncrypt: false,
      jtag: { padDisabled: false, usbDisabled: false, softDisJtag: 0 },
      download: {
        disDownloadMode: false,
        enableSecurityDownload: false,
        disForceDownload: false,
        disUsbSerialJtagDownload: false,
      },
      rdDis: 0,
      rdDisWriteProtected: false,
      secureVersion: 0,
    });
    const plainDemo = { profile: 'plain' as const, release: false, variant: 'demo', secureVersion: null };
    await service.handle(state(plainDemo), broken);

    const problems = reader()?.securityReportProblems ?? [];
    // Every code except the alternatives of other ones: firmware-info-missing, digest*-not-recorded,
    // flash-encryption-not-final, and key3 which is not checked any more.
    const alternatives = [
      'firmware-info-missing',
      'digest0-not-recorded',
      'digest1-not-recorded',
      'flash-encryption-not-final',
    ];
    expect([...problems].sort()).toEqual(
      ATTRACTAP_SECURITY_PROBLEMS.filter((code) => !alternatives.includes(code)).sort(),
    );
  });

  it('puts a secured reader whose later report fails back to not secured and records the problems', async () => {
    await service.handle(state(release), releaseReport());
    await service.handle(state(release), releaseReport({ rdDisWriteProtected: false, secureVersion: 0 }));
    expect(reader()).toMatchObject({
      secured: false,
      securedAt: null,
      efuseSecureVersion: 0,
      securityReportProblems: ['rd-dis-writable', 'secure-version-below-floor'],
    });
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
