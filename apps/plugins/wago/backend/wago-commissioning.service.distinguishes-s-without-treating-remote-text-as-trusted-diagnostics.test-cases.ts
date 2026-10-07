import { WagoRuntimeUploadError } from './wago-commissioning.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';

export function registerDistinguishesSWithoutTreatingRemoteTextAsTrustedDiagnostics(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it.each(['local-timeout', 'operation-aborted'] as const)(
    'distinguishes %s without treating remote text as trusted diagnostics',
    (termination) => {
      const error = new WagoRuntimeUploadError(
        null,
        123456,
        'secret: Runtime supervisor launch unverified: readiness\n',
        termination,
      );
      expect(error.message).toContain(`${termination}, SSH exit unknown, 123s elapsed`);
      expect(error.message).toContain('No recognized remote diagnostic');
      expect(error.message).not.toContain('secret');
    },
  );
}
