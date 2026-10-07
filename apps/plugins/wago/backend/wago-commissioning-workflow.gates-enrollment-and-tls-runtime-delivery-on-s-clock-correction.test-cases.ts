import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerGatesEnrollmentAndTlsRuntimeDeliveryOnSClockCorrection(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it.each(['verified', 'stale', 'unsupported', 'failed'])(
    'gates enrollment and TLS runtime delivery on %s clock correction',
    async (scenario) => {
      scope.wago.createEnrollment.mockClear();
      const old = `epoch=1654436642\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=${scenario === 'unsupported' ? 'unsupported' : 'supported'}\n`;
      let corrected = false;
      const order: string[] = [];
      const remote = jest.spyOn(scope.service as never, 'sudoRunScript').mockImplementation((async (
        host,
        pin,
        passedCredential,
        script: string,
        limits,
      ) => {
        expect(host).toBe(scope.session.targetHost);
        expect(pin).toBe(scope.session.hostKeyFingerprint);
        expect(passedCredential).toEqual(scope.credential);
        if (script.includes("printf 'epoch=")) {
          expect(limits).toEqual({ timeoutMs: 30000, maxOutputBytes: 4096 });
          order.push(corrected ? 'postcheck' : 'inspection');
          expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
          return corrected && scenario !== 'stale' ? scope.clockOutput() : old;
        }
        if (script.includes('/etc/config-tools/config_clock type=utc')) {
          order.push('correct');
          expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
          if (scenario === 'failed') throw new Error('clock setter failed');
          corrected = true;
        }
        return '';
      }) as never);
      const copy = jest.spyOn(scope.service as never, 'copyTo').mockImplementation((async () => {
        order.push('runtime');
        expect(scope.wago.createEnrollment).toHaveBeenCalledTimes(1);
      }) as never);
      const result = await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
      if (scenario === 'verified') {
        expect(result.state).toBe('awaiting_discovery');
        expect(order).toEqual(['inspection', 'correct', 'postcheck', 'runtime']);
        expect(JSON.parse(result.platformReport ?? 'null').clock).toMatchObject({
          result: 'synchronized',
          action: 'synchronize',
          skewSeconds: 0,
        });
      } else {
        expect(result.state).toBe('delivery_failed');
        expect(result.failureReason).toContain('UTC');
        expect(JSON.parse(result.platformReport ?? 'null').clock.result).toBe('failed');
        expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
        expect(copy).not.toHaveBeenCalled();
      }
      remote.mockRestore();
    },
  );
}
