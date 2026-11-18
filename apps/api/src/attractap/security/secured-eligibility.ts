import type { AttractapReaderKeyAlgorithm, AttractapSecurityProblem } from '@attraccess/application-models';
import type { ReportedBuild } from './session-security-state';

/** A build that may become secured: the release secure profile on a regular variant. */
export type SecurableBuild = ReportedBuild & { profile: 'secure'; release: true; variant: string };

/** A demo build (variant name) or a debug build never becomes secured. */
export function isDemoVariant(variant: string | null): boolean {
  return variant === null || /demo|debug/i.test(variant);
}

/**
 * Why a reported build can never be secured, whatever its eFuse report says. Empty only for a release build of the
 * secure profile and a regular (not demo, not debug) variant: secure-lab, plain, demo and non-release builds never are.
 */
export function buildEligibilityProblems(build: ReportedBuild | null): AttractapSecurityProblem[] {
  if (!build) return ['firmware-info-missing'];
  const problems: AttractapSecurityProblem[] = [];
  if (build.profile !== 'secure') problems.push('profile-not-secure');
  if (!build.release) problems.push('not-release-build');
  if (isDemoVariant(build.variant)) problems.push('demo-or-debug-variant');
  return problems;
}

export function isSecurableBuild(build: ReportedBuild | null): build is SecurableBuild {
  return buildEligibilityProblems(build).length === 0;
}

/** The build's problems, and the session's: only a session on the RSA-3072 (DS) key can secure a reader. */
export function securedEligibilityProblems(
  build: ReportedBuild | null,
  algorithm: AttractapReaderKeyAlgorithm | null,
): AttractapSecurityProblem[] {
  const problems = buildEligibilityProblems(build);
  if (algorithm !== 'rsa-3072') problems.push('software-identity');
  return problems;
}
