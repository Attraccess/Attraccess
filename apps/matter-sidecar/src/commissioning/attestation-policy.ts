/** What the policy needs of a matter.js `AttestationFinding`: its level and its check type. Never its message. */
export type FindingLike = { level: 'error' | 'warning' | 'info'; type: string };

/**
 * Finding types that fail commissioning whatever level matter.js gives them. matter.js reports a test Certification
 * Declaration as `info`, and a trust store or DCL it could not consult, or a CD signature it could not check, as
 * `warning`. The strict policy treats each as a failed attestation.
 */
export const ALWAYS_BLOCKING_FINDINGS: ReadonlySet<string> = new Set([
  'CertificationTypeTest',
  'DclServiceUnavailable',
  'CdSignerVerificationSkipped',
]);

/**
 * Test only: what the virtual device's attestation yields when the test PAAs are trusted. Its PAA is a test
 * certificate, its CD is a test CD, and its CD signer is not in the production trust store.
 */
export const TEST_PAA_TOLERATED_FINDINGS: readonly string[] = [
  'TrustedAsTestCertificate',
  'CertificationTypeTest',
  'CdSignerVerificationSkipped',
];

export type AttestationJudgment = {
  status: 'verified' | 'overridden' | 'failed';
  /** Every finding type, deduplicated, in order of appearance. */
  findings: string[];
  /** The finding types that failed attestation (empty when verified). */
  blocking: string[];
};

const unique = (types: string[]) => [...new Set(types)];

export const isBlocking = (finding: FindingLike) =>
  finding.level === 'error' || ALWAYS_BLOCKING_FINDINGS.has(finding.type);

/**
 * The strict attestation policy: any error-level finding, and any of {@link ALWAYS_BLOCKING_FINDINGS}, fails, unless
 * the attempt carries the confirmed override. Other warnings and infos pass and are recorded by type. `tolerated` is
 * the test seam; production passes none.
 */
export function judgeAttestation(
  findings: readonly FindingLike[],
  options: { override: boolean; tolerated?: readonly string[] },
): AttestationJudgment {
  const tolerated = new Set(options.tolerated ?? []);
  const types = unique(findings.map((finding) => finding.type));
  const blocking = unique(
    findings.filter((finding) => isBlocking(finding) && !tolerated.has(finding.type)).map((finding) => finding.type),
  );
  if (blocking.length === 0) return { status: 'verified', findings: types, blocking };
  return { status: options.override ? 'overridden' : 'failed', findings: types, blocking };
}

/**
 * The finding types a sidecar tolerates. Only the test seams (`trustTestPaa`, `tolerateFindings`, both unreachable from
 * the environment or HTTP) add any: production tolerates none.
 */
export function toleratedFindings(tuning?: {
  trustTestPaa?: boolean;
  tolerateFindings?: readonly string[];
}): readonly string[] {
  return [...(tuning?.trustTestPaa ? TEST_PAA_TOLERATED_FINDINGS : []), ...(tuning?.tolerateFindings ?? [])];
}
