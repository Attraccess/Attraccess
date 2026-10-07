import { TlsOptionsTestScope } from './mqtt-client.service.spec';
export function registerTlsOptionsIgnoresTlsTrustOptionsWhenTlsIsDisabled(scope: TlsOptionsTestScope): void {
  it('ignores TLS trust options when TLS is disabled', async () => {
    const { url, options } = await scope.connectWith({ useTls: false, caCert: 'ignored', tlsInsecure: true });

    expect(url).toBe('mqtt://localhost:1883');
    expect(options.ca).toBeUndefined();
    expect(options.rejectUnauthorized).toBeUndefined();
  });
}
