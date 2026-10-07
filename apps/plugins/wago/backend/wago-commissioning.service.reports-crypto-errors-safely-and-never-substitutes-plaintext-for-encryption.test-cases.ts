import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerReportsCryptoErrorsSafelyAndNeverSubstitutesPlaintextForEncryption(scope: WagoCommissioningServiceTestScope): void {
it('reports crypto errors safely and never substitutes plaintext for encryption', () => {
    const { service, context } = scope.securityHarness();
    context.secrets.encrypt.mockImplementation(() => {
      throw new Error('unlabelled-crypto-secret');
    });
    expect(() => service['encryptVerifier'](scope.verifier)).toThrow('Commissioning verifier encryption failed.');
  });
}
