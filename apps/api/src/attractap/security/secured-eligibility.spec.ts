import { buildEligibilityProblems, isSecurableBuild } from './secured-eligibility';
import type { ReportedBuild } from './session-security-state';

const release: ReportedBuild = { profile: 'secure', release: true, variant: 'attractap-touch-v2', secureVersion: 1 };

describe('secured eligibility', () => {
  it('lets only a release secure build of a regular variant be secured', () => {
    expect(buildEligibilityProblems(release)).toEqual([]);
    expect(isSecurableBuild(release)).toBe(true);
  });

  it.each<[string, ReportedBuild | null, string[]]>([
    ['no firmware info', null, ['firmware-info-missing']],
    ['secure-lab', { ...release, profile: 'secure-lab', release: false }, ['profile-not-secure', 'not-release-build']],
    ['plain', { ...release, profile: 'plain' }, ['profile-not-secure']],
    ['an unknown profile', { ...release, profile: null }, ['profile-not-secure']],
    ['a non-release secure build', { ...release, release: false }, ['not-release-build']],
    ['a demo variant', { ...release, variant: 'attractap-touch-v2-demo' }, ['demo-or-debug-variant']],
    ['a debug variant', { ...release, variant: 'attractap-DEBUG' }, ['demo-or-debug-variant']],
    ['no variant', { ...release, variant: null }, ['demo-or-debug-variant']],
  ])('never secures %s', (_name, build, problems) => {
    expect(buildEligibilityProblems(build)).toEqual(problems);
    expect(isSecurableBuild(build)).toBe(false);
  });
});
