import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DOUT } from './wago-hardware-deployment';
import { parseWagoHardwareDeploymentReport } from './wago-hardware-deployment';
import { wagoHardwareDeploymentReportScript } from './wago-hardware-deployment';
import type { SourceOnlyCodesysClassificationTestScope } from './wago-codesys-classification.spec';
import { wagoRuntimeBootScript } from './wago-hardware-deployment';

export function registerStillBlocksAProviderHoldingWritableDoutAliasS(
  scope: SourceOnlyCodesysClassificationTestScope,
): void {
  it.each([false, true])('still blocks a provider holding writable DOUT (alias=%s)', (alias) => {
    const target = join(scope.fixture.root, WAGO_DOUT);
    if (alias) symlinkSync(target, join(scope.fixture.root, 'dout-alias'));
    symlinkSync(alias ? join(scope.fixture.root, 'dout-alias') : target, join(scope.fixture.root, 'proc/88/fd/3'));
    scope.fixture.file('proc/88/fdinfo/3', 'flags:\t0100002\n');
    expect(scope.classify()).toBe('inactive');
    const report = scope.fixture.run(wagoHardwareDeploymentReportScript(scope.fixture.root));
    expect(report.status).toBe(0);
    expect(parseWagoHardwareDeploymentReport(report.stdout).exclusivity).toBe('unknown');
  });
}

export function registerStillBlocksEnabledBootRuntimeWithOnlyTheVerifiedProvider(
  scope: SourceOnlyCodesysClassificationTestScope,
): void {
  it('still blocks enabled boot runtime with only the verified provider', () => {
    scope.fixture.file('etc/specific/rtsversion', '2');
    scope.fixture.file('etc/attraccess-wago/runtime-enabled', '');
    const report = scope.fixture.run(wagoHardwareDeploymentReportScript(scope.fixture.root));
    expect(report.status).toBe(0);
    expect(parseWagoHardwareDeploymentReport(report.stdout).exclusivity).toBe('codesys-boot-enabled');
    const boot = scope.fixture.run('set -- start-checked\n' + wagoRuntimeBootScript(scope.fixture.root));
    expect(boot.status).not.toBe(0);
    expect(boot.stderr).toContain('codesys-boot-enabled');
  });
}
