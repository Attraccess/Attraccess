import { SessionSecurityState, parseReportedBuild } from './session-security-state';

const info = { profile: 'secure', release: true, variant: 'attractap-touch-v2', secureVersion: 3 };

describe('parseReportedBuild', () => {
  it('takes the profile, release flag, variant and app secure_version the reader reported', () => {
    expect(parseReportedBuild(info)).toEqual({
      profile: 'secure',
      release: true,
      variant: 'attractap-touch-v2',
      secureVersion: 3,
    });
  });

  it('reads an old firmware without any of the fields as a plain claim of nothing', () => {
    expect(parseReportedBuild(undefined)).toEqual({
      profile: null,
      release: false,
      variant: null,
      secureVersion: null,
    });
    expect(parseReportedBuild({ variant: 7 })).toMatchObject({ variant: null });
  });

  it.each(['SECURE', 'secure-release', '', 1, null])('drops an unknown profile %p', (profile) => {
    expect(parseReportedBuild({ ...info, profile }).profile).toBeNull();
  });

  it.each([-1, 1.5, 70000, '3', Number.NaN])('drops a secure version that is no u16 integer: %p', (secureVersion) => {
    expect(parseReportedBuild({ ...info, secureVersion }).secureVersion).toBeNull();
  });

  it('counts only a literal true as a release build', () => {
    expect(parseReportedBuild({ ...info, release: 'true' }).release).toBe(false);
    expect(parseReportedBuild({ ...info, release: 1 }).release).toBe(false);
  });

  it('cuts the variant to 64 characters', () => {
    expect(parseReportedBuild({ ...info, variant: 'v'.repeat(100) }).variant).toBe('v'.repeat(64));
  });

  it('ignores the reader claiming to be secured', () => {
    expect(parseReportedBuild({ ...info, secured: true })).toEqual(parseReportedBuild(info));
    expect(parseReportedBuild({ secured: true })).toEqual(parseReportedBuild({}));
  });
});

describe('SessionSecurityState', () => {
  const build = parseReportedBuild(info);

  it('hands the build to a waiting report as soon as the firmware info arrives', async () => {
    const state = new SessionSecurityState(1, 'a'.repeat(64), 'rsa-3072');
    const waiting = state.whenBuild(5_000);
    state.setBuild(build);
    await expect(waiting).resolves.toBe(build);
    await expect(state.whenBuild(5_000)).resolves.toBe(build);
    expect(state.currentBuild()).toBe(build);
  });

  it('gives up waiting with null when no firmware info arrives', async () => {
    jest.useFakeTimers();
    try {
      const state = new SessionSecurityState(1, 'a'.repeat(64), 'ecdsa-p256');
      const waiting = state.whenBuild(1_000);
      jest.advanceTimersByTime(1_000);
      await expect(waiting).resolves.toBeNull();
      // A late firmware info does not reach the waiter that already gave up.
      state.setBuild(build);
      expect(state.currentBuild()).toBe(build);
    } finally {
      jest.useRealTimers();
    }
  });
});
