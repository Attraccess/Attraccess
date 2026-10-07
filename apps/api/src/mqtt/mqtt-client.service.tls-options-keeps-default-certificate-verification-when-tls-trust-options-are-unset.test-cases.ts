import { TlsOptionsTestScope } from './mqtt-client.service.spec';
export function registerTlsOptionsKeepsDefaultCertificateVerificationWhenTlsTrustOptionsAreUnset(
  scope: TlsOptionsTestScope,
): void {
  it('keeps default certificate verification when TLS trust options are unset', async () => {
    const { options } = await scope.connectWith({ useTls: true, port: 8883 });

    expect(options.ca).toBeUndefined();
    expect(options.servername).toBeUndefined();
    expect(options.rejectUnauthorized).toBeUndefined();
  });
}
