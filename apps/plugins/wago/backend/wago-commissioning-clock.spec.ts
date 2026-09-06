import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOCK_INSPECTION_SCRIPT, CLOCK_LIMITS, commissionClock } from './wago-commissioning-clock';

const host = Date.parse('2026-09-06T18:00:00Z');
const epoch = host / 1000;
const oldEpoch = Date.parse('2022-06-05T13:44:02Z') / 1000;
const boot = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const output = (time = oldEpoch, tool = 'supported', uptime = '100.00', id = boot) =>
  `epoch=${time}\nuptime=${uptime}\nboot=${id}\ntool=${tool}\n`;

describe('source-backed commissioning clock gate (mocked transport only)', () => {
  const report = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => report.mockClear());

  it('read-only inspection reports 2022 versus application 2026 without mutation or consent', async () => {
    const execute = jest.fn().mockResolvedValue(output());
    await expect(
      commissionClock(
        execute,
        false,
        report,
        () => host,
        () => 0,
      ),
    ).resolves.toMatchObject({
      action: 'none',
      result: 'correction-required',
      skewSeconds: oldEpoch - epoch,
      hostUtc: '2026-09-06T18:00:00.000Z',
      controllerUtc: '2022-06-05T13:44:02.000Z',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(CLOCK_INSPECTION_SCRIPT, CLOCK_LIMITS);
    expect(CLOCK_INSPECTION_SCRIPT).not.toContain('type=utc');
  });

  it('does not change an already aligned clock, including when the mutator is unsupported', async () => {
    const execute = jest.fn().mockResolvedValue(output(epoch, 'unsupported'));
    await expect(
      commissionClock(
        execute,
        true,
        report,
        () => host,
        () => 0,
      ),
    ).resolves.toMatchObject({ result: 'within-tolerance', action: 'none' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported tool before mutation', async () => {
    const execute = jest.fn().mockResolvedValue(output(oldEpoch, 'unsupported'));
    await expect(
      commissionClock(
        execute,
        true,
        report,
        () => host,
        () => 0,
      ),
    ).rejects.toThrow('Unsupported FW31');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ result: 'failed', action: 'none' }));
  });

  it('uses the exact source-pinned vendor UTC arguments and verifies a fresh postcondition', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(output())
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(output(epoch));
    await expect(
      commissionClock(
        execute,
        true,
        report,
        () => host,
        () => 0,
      ),
    ).resolves.toMatchObject({ result: 'synchronized', previousSkewSeconds: oldEpoch - epoch, skewSeconds: 0 });
    const script: string = execute.mock.calls[1][0];
    expect(script).toContain('b230f853745ced8f772579093b55af24826986378dcf4926cef67ae95c31d7c5');
    expect(script).toContain('timeout -s KILL 10 /etc/config-tools/config_clock type=utc "time=$time" "date=$date"');
    expect(script).toContain('0) time=18:00:00; date=06.09.2026;;');
    expect(script).toContain('30) time=18:00:30; date=06.09.2026;;');
    expect(script).toContain(`test "$(cat /proc/sys/kernel/random/boot_id)" = '${boot}'`);
    expect(execute.mock.calls[2][0]).toBe(CLOCK_INSPECTION_SCRIPT);
    expect(execute.mock.calls.every((call) => call[1] === CLOCK_LIMITS)).toBe(true);

    // Execute ONLY the arithmetic guard with fixture values. No proc, clock,
    // vendor tool, networking or device commands are executed by this test.
    const guard = script
      .slice(script.indexOf('elapsed='), script.indexOf('umask 077'))
      .replace('current=$(/bin/date -u +%s)', 'current=$2');
    const allowed = (uptime: number, current: number) =>
      spawnSync('sh', ['-c', `set -eu; uptime=$1; ${guard}`, 'fixture', String(uptime), String(current)]).status === 0;
    expect(allowed(100, oldEpoch)).toBe(true);
    expect(allowed(130, oldEpoch + 30)).toBe(true);
    expect(allowed(131, oldEpoch + 31)).toBe(false);
    expect(allowed(99, oldEpoch)).toBe(false);
    expect(allowed(100, epoch)).toBe(false); // replay after successful correction
    expect(allowed(100, oldEpoch + 3)).toBe(false); // independently changed clock
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

  it('rechecks application clock continuity immediately before enrollment, including after persistence', async () => {
    let offset = 0;
    const execute = jest.fn().mockResolvedValue(output(epoch));
    const verified = await commissionClock(
      execute,
      true,
      report,
      () => host + offset,
      () => 0,
    );
    verified.assertFresh();
    offset = 10_000;
    expect(verified.assertFresh).toThrow('Application clock changed');
    offset = 0;
    await expect(
      commissionClock(
        execute,
        true,
        async () => {
          offset = 10_000;
        },
        () => host + offset,
        () => 0,
      ),
    ).rejects.toThrow('Application clock changed');
  });

  it.each(['stale', 'reboot', 'uptime', 'failed'])('blocks %s correction postcondition', async (failure) => {
    const execute = jest.fn().mockResolvedValueOnce(output());
    if (failure === 'failed') execute.mockRejectedValueOnce(new Error('vendor failed'));
    else
      execute
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(
          output(
            failure === 'stale' ? oldEpoch : epoch,
            'supported',
            failure === 'uptime' ? '99.00' : '100.00',
            failure === 'reboot' ? boot.replace('aaaa', 'ffff') : boot,
          ),
        );
    await expect(
      commissionClock(
        execute,
        true,
        report,
        () => host,
        () => 0,
      ),
    ).rejects.toThrow();
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ result: 'failed', action: 'synchronize' }));
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ observation: failure === 'failed' ? 'before-action' : 'after-action' }),
    );
  });

  it('does not admit an ahead clock hidden by response latency', async () => {
    let elapsed = 0;
    const execute = jest.fn().mockImplementation(async () => {
      elapsed = 20_000;
      return output(epoch + 20);
    });
    await expect(
      commissionClock(
        execute,
        true,
        report,
        () => host + elapsed,
        () => elapsed,
      ),
    ).rejects.toThrow('expired');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('includes observation uncertainty rather than claiming the midpoint is exact', async () => {
    let elapsed = 0;
    const execute = jest.fn().mockImplementation(async () => {
      elapsed = 4000;
      return output(epoch + 5);
    });
    await expect(
      commissionClock(
        execute,
        false,
        report,
        () => host + elapsed,
        () => elapsed,
      ),
    ).resolves.toMatchObject({
      skewSeconds: 3,
      uncertaintySeconds: 3,
      result: 'correction-required',
      action: 'none',
    });
  });

  it('advances the allowlisted UTC date across midnight without accepting unbounded elapsed time', async () => {
    const midnight = Date.parse('2026-12-31T23:59:50Z');
    const execute = jest
      .fn()
      .mockResolvedValueOnce(output())
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(output(midnight / 1000));
    await commissionClock(
      execute,
      true,
      report,
      () => midnight,
      () => 0,
    );
    expect(execute.mock.calls[1][0]).toContain('10) time=00:00:00; date=01.01.2027;;');
    expect(execute.mock.calls[1][0]).toContain('30) time=00:00:20; date=01.01.2027;;');
    expect(execute.mock.calls[1][0]).not.toContain('31) time=');
  });

  it.each([
    'epoch=NaN\n',
    output().replace('1654436642', '9999999999'),
    output().replace(boot, '$(id)'),
    output() + 'epoch=123\n',
  ])('rejects malformed observation %s', async (invalid) => {
    const execute = jest.fn().mockResolvedValue(invalid);
    await expect(
      commissionClock(
        execute,
        true,
        report,
        () => host,
        () => 0,
      ),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([NaN, Infinity, Date.parse('2039-01-01'), Date.parse('2019-01-01')])(
    'rejects invalid host epoch %s',
    async (invalid) => {
      await expect(
        commissionClock(
          jest.fn().mockResolvedValue(output()),
          true,
          report,
          () => invalid,
          () => 0,
        ),
      ).rejects.toThrow();
    },
  );

  it('rejects excessive skew', async () => {
    await expect(
      commissionClock(
        jest.fn().mockResolvedValue(output(Date.parse('2020-01-01') / 1000)),
        true,
        report,
        () => Date.parse('2037-01-01'),
        () => 0,
      ),
    ).rejects.toThrow('ten-year');
  });

  it.each(['slow-read', 'slow-save', 'host-jump'])('rejects %s before mutation', async (scenario) => {
    let elapsed = 0;
    let hostOffset = 0;
    const execute = jest.fn().mockImplementation(async () => {
      if (scenario === 'slow-read') elapsed = 30_001;
      if (scenario === 'host-jump') hostOffset = 2000;
      return output();
    });
    const save = async () => {
      if (scenario === 'slow-save') elapsed = 30_001;
    };
    await expect(
      commissionClock(
        execute,
        true,
        save,
        () => host + elapsed + hostOffset,
        () => elapsed,
      ),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
