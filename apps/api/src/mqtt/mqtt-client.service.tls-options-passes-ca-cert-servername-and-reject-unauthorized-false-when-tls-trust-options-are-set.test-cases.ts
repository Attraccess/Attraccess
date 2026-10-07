import { TlsOptionsTestScope } from './mqtt-client.service.spec';
export function registerTlsOptionsPassesCaCertServernameAndRejectUnauthorizedFalseWhenTlsTrustOptionsAreSet(
  scope: TlsOptionsTestScope,
): void {
  it('passes CA cert, servername and rejectUnauthorized=false when TLS trust options are set', async () => {
    const { url, options } = await scope.connectWith({
      useTls: true,
      port: 8883,
      caCert: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
      tlsServername: 'broker.example.com',
      tlsInsecure: true,
    });

    expect(url).toBe('mqtts://localhost:8883');
    expect(options.ca).toContain('BEGIN CERTIFICATE');
    expect(options.servername).toBe('broker.example.com');
    expect(options.rejectUnauthorized).toBe(false);
  });
}
