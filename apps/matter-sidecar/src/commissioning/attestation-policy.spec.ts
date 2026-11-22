import {
  ALWAYS_BLOCKING_FINDINGS,
  TEST_PAA_TOLERATED_FINDINGS,
  judgeAttestation,
  toleratedFindings,
  type FindingLike,
} from './attestation-policy';

const strict = { override: false };

describe('the strict attestation policy', () => {
  // Every check matter.js 0.18 reports at error level, collected or thrown.
  it.each([
    'PaaNotTrusted',
    'CertificateChainInvalid',
    'CertificateExpired',
    'VendorIdMismatch',
    'AttestationSignatureInvalid',
    'AttestationNonceMismatch',
    'CertificationDeclarationSignatureInvalid',
    'CertificationDeclarationFieldMismatch',
    'CertificateRevoked',
    'FirmwareInfoMismatch',
    'CertificateIdNotVerified',
    'CertificateUnparseable',
    'AttestationElementsUnparseable',
    'CertificationDeclarationUnparseable',
    'TrustedAsTestCertificate',
    'ValidationError',
  ])('fails on the error-level finding %s', (type) => {
    expect(judgeAttestation([{ level: 'error', type }], strict)).toEqual({
      status: 'failed',
      findings: [type],
      blocking: [type],
    });
  });

  // The levels matter.js 0.18 gives these (DeviceAttestationValidator): none of them is `error`.
  it.each<FindingLike>([
    { level: 'info', type: 'CertificationTypeTest' },
    { level: 'warning', type: 'DclServiceUnavailable' },
    { level: 'warning', type: 'CdSignerVerificationSkipped' },
  ])('fails on $type although matter.js reports it as $level', (finding) => {
    expect(ALWAYS_BLOCKING_FINDINGS.has(finding.type)).toBe(true);
    expect(judgeAttestation([finding], strict)).toEqual({
      status: 'failed',
      findings: [finding.type],
      blocking: [finding.type],
    });
  });

  it.each<FindingLike>([
    { level: 'warning', type: 'CertificationTypeProvisional' },
    { level: 'info', type: 'PaaTrustStoreTimeMismatch' },
  ])('passes the $level finding $type as verified and records its type', (finding) => {
    expect(judgeAttestation([finding, finding], strict)).toEqual({
      status: 'verified',
      findings: [finding.type],
      blocking: [],
    });
  });

  it('records every type but blocks only on the blocking ones', () => {
    const judgment = judgeAttestation(
      [
        { level: 'info', type: 'PaaTrustStoreTimeMismatch' },
        { level: 'error', type: 'PaaNotTrusted' },
        { level: 'warning', type: 'CdSignerVerificationSkipped' },
      ],
      strict,
    );
    expect(judgment).toEqual({
      status: 'failed',
      findings: ['PaaTrustStoreTimeMismatch', 'PaaNotTrusted', 'CdSignerVerificationSkipped'],
      blocking: ['PaaNotTrusted', 'CdSignerVerificationSkipped'],
    });
  });

  it('passes blocking findings as overridden only with the confirmed override', () => {
    const findings: FindingLike[] = [
      { level: 'error', type: 'PaaNotTrusted' },
      { level: 'info', type: 'CertificationTypeTest' },
    ];
    expect(judgeAttestation(findings, { override: true })).toEqual({
      status: 'overridden',
      findings: ['PaaNotTrusted', 'CertificationTypeTest'],
      blocking: ['PaaNotTrusted', 'CertificationTypeTest'],
    });
    // The override is never needed, and never reported, when nothing blocks.
    expect(judgeAttestation([], { override: true }).status).toBe('verified');
  });

  it('passes the test seam’s tolerated types as verified, and nothing else', () => {
    const virtualDevice: FindingLike[] = [
      { level: 'error', type: 'TrustedAsTestCertificate' },
      { level: 'warning', type: 'CdSignerVerificationSkipped' },
      { level: 'info', type: 'CertificationTypeTest' },
    ];
    const tolerated = toleratedFindings({ trustTestPaa: true });
    expect(judgeAttestation(virtualDevice, { override: false, tolerated })).toEqual({
      status: 'verified',
      findings: ['TrustedAsTestCertificate', 'CdSignerVerificationSkipped', 'CertificationTypeTest'],
      blocking: [],
    });
    expect(
      judgeAttestation([...virtualDevice, { level: 'error', type: 'PaaNotTrusted' }], { override: false, tolerated })
        .blocking,
    ).toEqual(['PaaNotTrusted']);
    expect(
      judgeAttestation([{ level: 'warning', type: 'DclServiceUnavailable' }], { override: false, tolerated }),
    ).toMatchObject({
      status: 'failed',
    });
  });
});

describe('tolerated findings', () => {
  it('are none for production, which passes no tuning', () => {
    expect(toleratedFindings()).toEqual([]);
    expect(toleratedFindings({})).toEqual([]);
    expect(toleratedFindings({ trustTestPaa: false })).toEqual([]);
  });

  it('are the virtual device’s test findings under the trustTestPaa seam, plus explicit ones', () => {
    expect(toleratedFindings({ trustTestPaa: true })).toEqual(TEST_PAA_TOLERATED_FINDINGS);
    expect(toleratedFindings({ trustTestPaa: true, tolerateFindings: ['X'] })).toEqual([
      ...TEST_PAA_TOLERATED_FINDINGS,
      'X',
    ]);
    expect(toleratedFindings({ tolerateFindings: ['X'] })).toEqual(['X']);
  });
});
