import { rootCertificates } from 'node:tls';
import { createHash, X509Certificate } from 'node:crypto';
import { fw31IdentityOutput } from './fixtures/fw31-identity';
import { runtimeBundleStagingCapacityPreflightScript } from './wago-runtime-install';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerDeliverySProtectsSecretsAndCleansVerifiedArtifacts(scope: WagoCommissioningServiceTestScope): void {
it.each(['success', 'codesys', 'prerequisites', 'ca', 'plain', 'insecure'])(
    'delivery %s protects secrets and cleans verified artifacts',
    async (scenario) => {
      const fs = require('node:fs/promises') as typeof import('node:fs/promises');
      const bundle = Buffer.from('mock runtime bundle');
      const digest = createHash('sha256').update(bundle).digest('hex');
      jest.spyOn(fs, 'mkdtemp').mockResolvedValue('/mock/staging');
      jest.spyOn(fs, 'copyFile').mockResolvedValue(undefined);
      jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
      jest.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true } as never);
      jest.spyOn(fs, 'readFile').mockImplementation((async (path: string) => {
        if (path.endsWith('.sha256')) return `${digest}  runtime.tar\n`;
        if (path.endsWith('.pub')) return 'mock-public-key';
        return bundle;
      }) as never);
      try {
        const { service, session, repository, wago, inspect, sudo, context } = scope.securityHarness(
          { firmwareBaseline: '31', deliveryToken: null },
          scope.configuredService(),
        );
        inspect.mockResolvedValue({
          firmware: fw31IdentityOutput(),
          codesys: scenario === 'codesys' ? 'active' : 'inactive',
        });
        const copy = jest.fn().mockResolvedValue(undefined);
        const install = jest
          .fn()
          .mockImplementation(async (_host, _pin, _credential, script: string) =>
            script.includes("printf 'epoch=")
              ? `epoch=${Math.floor(Date.now() / 1000)}\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=supported\n`
              : '',
          );
        service['copyTo'] = copy;
        service['sudoRunScript'] = install;
        if (scenario === 'prerequisites') install.mockRejectedValue(new Error('private output'));
        let caCert: string | undefined;
        if (scenario === 'ca') {
          caCert = rootCertificates.find((pem) => {
            const certificate = new X509Certificate(pem);
            return (
              certificate.ca &&
              Date.parse(certificate.validFrom) < Date.now() &&
              Date.parse(certificate.validTo) > Date.now()
            );
          });
          expect(caCert).toBeDefined();
          context.getMqttServerConfig.mockResolvedValue({
            host: 'mock.invalid',
            port: 8883,
            useTls: true,
            caCert,
          } as never);
        }
        if (scenario === 'plain' || scenario === 'insecure')
          context.getMqttServerConfig.mockResolvedValue({
            host: 'mock.invalid',
            port: scenario === 'plain' ? 1883 : 8883,
            useTls: scenario === 'insecure',
            tlsInsecure: scenario === 'insecure',
          } as never);
        wago.createEnrollment.mockResolvedValue({
          id: 8,
          expiresAt: 'later',
          password: 'mqtt-password',
          username: 'enrollment',
          claimSecret: 'claim-secret',
          broker: { host: 'mock.invalid', port: 1883, useTls: false },
        });
        const persisted: string[] = [];
        repository.save.mockImplementation(async (value) => {
          persisted.push(JSON.stringify(value));
          return value;
        });
        const result = await service.deliver(1, {
          confirmInstall: true,
          temporarySsh: { username: 'root', password: 'explicit-ssh' },
        });
        expect(fs.rm).toHaveBeenCalledWith('/mock/staging', { recursive: true, force: true });
        if (scenario === 'prerequisites') {
          expect(result.state).toBe('delivery_failed');
          expect(copy).not.toHaveBeenCalled();
          expect(wago.createEnrollment).not.toHaveBeenCalled();
          expect(sudo).not.toHaveBeenCalled();
          expect(result.failureReason).toContain('permanently disabled');
          expect(result.dockerProvisionState).toBeUndefined();
          expect(session.dockerProvisionToken).toBeFalsy();
          expect(install).toHaveBeenCalledTimes(1);
          expect(install.mock.calls[0][3]).toBe(runtimeBundleStagingCapacityPreflightScript(bundle.length));
          return;
        }
        expect(result.state).toBe('awaiting_discovery');
        expect(sudo).not.toHaveBeenCalled();
        expect(copy).toHaveBeenCalledTimes(1);
        expect(install).toHaveBeenCalledTimes(5);
        expect(session.codesysState).toBe('disabled');
        expect(install.mock.calls[0][3]).toBe(runtimeBundleStagingCapacityPreflightScript(bundle.length));
        expect(install.mock.calls[1][3]).toContain('runtime-version=0');
        expect(copy.mock.calls[0][4]).toContain('flock -n 9');
        expect(copy.mock.calls[0][4]).toContain(
          Buffer.from(
            [
              'WAGO_HARDWARE_ID=cc100-test',
              `WAGO_MQTT_URL=${scenario === 'plain' ? 'mqtt://mock.invalid:1883' : 'mqtts://mock.invalid:8883'}`,
              'WAGO_MQTT_USERNAME=enrollment',
              'WAGO_MQTT_PASSWORD=mqtt-password',
              'WAGO_ENROLLMENT_SECRET=claim-secret',
              `WAGO_PAIRING_CODE=${scope.verifier}`,
              ...(scenario === 'insecure' ? ['WAGO_MQTT_TLS_INSECURE=true'] : []),
              ...(caCert ? ['NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem'] : []),
            ].join('\n'),
          ).toString('base64'),
        );
        if (caCert) expect(copy.mock.calls[0][4]).toContain(Buffer.from(caCert).toString('base64'));
        expect(session.pairingCode).toBe('encrypted:v1:opaque-ciphertext');
        for (const value of persisted) {
          expect(value).not.toContain(scope.verifier);
          expect(value).not.toMatch(/mqtt-password|claim-secret|explicit-ssh/);
        }
      } finally {
        jest.restoreAllMocks();
      }
    },
  );
}
