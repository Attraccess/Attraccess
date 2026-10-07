import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOCK_INSPECTION_SCRIPT, CLOCK_LIMITS, commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerUsesTheExactSourcePinnedVendorUtcArgumentsAndVerifiesAFreshPostcondition(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('uses the exact source-pinned vendor UTC arguments and verifies a fresh postcondition', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(scope.output())
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(scope.output(scope.epoch));
    await expect(
      commissionClock(
        execute,
        true,
        scope.report,
        () => scope.host,
        () => 0,
      ),
    ).resolves.toMatchObject({ result: 'synchronized', previousSkewSeconds: scope.oldEpoch - scope.epoch, skewSeconds: 0 });
    const script: string = execute.mock.calls[1][0];
    expect(script).toContain('b230f853745ced8f772579093b55af24826986378dcf4926cef67ae95c31d7c5');
    expect(script).toContain('timeout -s KILL 10 /etc/config-tools/config_clock type=utc "time=$time" "date=$date"');
    expect(script).toContain('0) time=18:00:00; date=06.09.2026;;');
    expect(script).toContain('30) time=18:00:30; date=06.09.2026;;');
    expect(script).toContain(`test "$(cat /proc/sys/kernel/random/boot_id)" = '${scope.boot}'`);
    expect(execute.mock.calls[2][0]).toBe(CLOCK_INSPECTION_SCRIPT);
    expect(execute.mock.calls.every((call) => call[1] === CLOCK_LIMITS)).toBe(true);

    // Execute ONLY the arithmetic guard with fixture values. No proc, clock,
    // vendor tool, networking or device commands are executed by this test.
    const guard = script
      .slice(script.indexOf('elapsed='), script.indexOf('umask 077'))
      .replace('current=$(/bin/date -u +%s)', 'current=$2');
    const allowed = (uptime: number, current: number) =>
      spawnSync('sh', ['-c', `set -eu; uptime=$1; ${guard}`, 'fixture', String(uptime), String(current)]).status === 0;
    expect(allowed(100, scope.oldEpoch)).toBe(true);
    expect(allowed(130, scope.oldEpoch + 30)).toBe(true);
    expect(allowed(131, scope.oldEpoch + 31)).toBe(false);
    expect(allowed(99, scope.oldEpoch)).toBe(false);
    expect(allowed(100, scope.epoch)).toBe(false); // replay after successful correction
    expect(allowed(100, scope.oldEpoch + 3)).toBe(false); // independently changed clock
    const directory = mkdtempSync(join(tmpdir(), 'wago-clock-nonce-test-'));
    try {
      const marker = script.match(/^mkdir \/run\/(attraccess-wago-clock-[a-f0-9]{32})$/m)?.[1];
      expect(marker).toBeDefined();
      if (!marker) throw new Error('Missing one-shot clock marker');
      // Only the exclusive mkdir primitive is tested on an isolated local fixture.
      // Consuming the same attempt twice fails even if the vendor changed no time.
      const consume = `mkdir '${join(directory, marker)}'`;
      expect(spawnSync('sh', ['-c', `${consume} && ! ${consume}`]).status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
