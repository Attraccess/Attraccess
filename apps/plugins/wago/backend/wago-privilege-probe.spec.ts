import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { WAGO_DIN, WAGO_DOUT } from './wago-hardware-deployment';
import { wagoPrivilegeProbeShell, wagoPrivilegeVerificationShell } from './wago-privilege-probe';

describe('read-only privilege probe (mock transitions, actual verification shell)', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  beforeEach(() => {
    fixture = fw31ShellFixture();
  });
  afterEach(() => fixture.dispose());
  it.each(['', 'busybox-setpriv', 'io-permissions', 'privilege-transitions-failed'])(
    'preserves caller arguments across the probe: %s',
    (fault) => {
      const result = fixture.run(
        `set -eu
din='${fixture.root}${WAGO_DIN}'
dout='${fixture.root}${WAGO_DOUT}'
set -- -v 'protected CA:mount:ro' '' '*'
${wagoPrivilegeProbeShell()}
printf '<%s>\\n' "$@"
printf '%s' "$hardware"`,
        fault,
      );
      expect(result.status).toBe(0);
      const hardware =
        fault === 'io-permissions'
          ? 'uid10001-access-denied'
          : fault === 'privilege-transitions-failed'
            ? 'permission-tool-unavailable'
            : 'accessible';
      expect(result.stdout).toBe(`<-v>\n<protected CA:mount:ro>\n<>\n<*>\n${hardware}`);
    },
  );
  const run = (fault = '', observation = '') =>
    fixture.run(
      `set -eu\ndin='${fixture.root}${WAGO_DIN}'\ndout='${fixture.root}${WAGO_DOUT}'\n${wagoPrivilegeProbeShell()}\n${observation}\nprintf '%s' "$hardware"`,
      fault,
    );

  it('executes the verifier when a directly spawned fixture has no fault environment variable', () => {
    const result = fixture.run(
      `set -eu
unset FAULT
din='${fixture.root}${WAGO_DIN}'
dout='${fixture.root}${WAGO_DOUT}'
${wagoPrivilegeProbeShell()}
printf '%s' "$hardware"`,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('accessible');
    expect(fixture.read('permission-tests.log').trim().split('\n')).toHaveLength(3);
  });

  it.each(['', 'busybox-setpriv'])(
    'validates the exact transition argv and executes all three access predicates: %s',
    (fault) => {
      const result = run(fault);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('accessible');
      const argv = JSON.parse(fixture.read('privilege.log').trim());
      expect(argv).toEqual(
        fault
          ? [
              'capsh',
              '--drop=all',
              '--groups=',
              '--gid=10001',
              '--uid=10001',
              '--caps=',
              '--noamb',
              '--no-new-privs',
              '--shell=/bin/sh',
              '--',
              '-c',
            ]
          : [
              'setpriv',
              '--reuid=10001',
              '--regid=10001',
              '--clear-groups',
              '--bounding-set=-all',
              '--inh-caps=-all',
              '--ambient-caps=-all',
              '--no-new-privs',
              '/bin/sh',
              '-c',
            ],
      );
      expect(fixture.read('permission-tests.log').trim().split('\n')).toEqual([
        `-r ${fixture.root}${WAGO_DIN}`,
        `-r ${fixture.root}${WAGO_DOUT}`,
        `-w ${fixture.root}${WAGO_DOUT}`,
      ]);
      expect(fixture.read(WAGO_DIN)).toBe('5');
      expect(fixture.read(WAGO_DOUT)).toBe('2');
    },
  );

  it.each(['Uid', 'Gid'].flatMap((key) => [0, 1, 2, 3].map((index) => [key, index] as const)))(
    'rejects incorrect %s component %s before testing permissions',
    (key, index) => {
      const ids = ['10001', '10001', '10001', '10001'];
      ids[index] = '0';
      fixture.file(
        'privilege-status',
        fixture.read('privilege-status').replace(`${key}: 10001 10001 10001 10001`, `${key}: ${ids.join(' ')}`),
      );
      expect(run().stdout).toBe('permission-tool-unavailable');
      expect(existsSync(join(fixture.root, 'permission-tests.log'))).toBe(false);
    },
  );

  it.each([
    ['Groups:', '10001'],
    ['CapInh:', '0001'],
    ['CapPrm:', '0001'],
    ['CapEff:', '0001'],
    ['CapBnd:', '0001'],
    ['CapAmb:', '0001'],
    ['NoNewPrivs:', '0'],
    ['CapEff:', 'garbage'],
    ['CapBnd:', ''],
    ['Uid:', '10001 10001 10001'],
    ['Gid:', '10001 10001 10001 10001 10001'],
  ])('rejects unsafe or malformed %s=%s before access checks', (key, value) => {
    fixture.file(
      'privilege-status',
      fixture.read('privilege-status').replace(new RegExp(`${key}[^\n]*`), `${key} ${value}`),
    );
    expect(run('busybox-setpriv').stdout).toBe('permission-tool-unavailable');
    expect(existsSync(join(fixture.root, 'permission-tests.log'))).toBe(false);
  });

  it.each(['Uid:', 'Gid:', 'Groups:', 'CapInh:', 'CapPrm:', 'CapEff:', 'CapBnd:', 'CapAmb:', 'NoNewPrivs:'])(
    'rejects missing or duplicate %s',
    (key) => {
      const original = fixture.read('privilege-status');
      const line = original.split('\n').find((value) => value.startsWith(key))!;
      for (const state of [original.replace(line + '\n', ''), original + line + '\n']) {
        fixture.file('privilege-status', state);
        expect(run().stdout).toBe('permission-tool-unavailable');
        expect(existsSync(join(fixture.root, 'permission-tests.log'))).toBe(false);
      }
    },
  );

  it('classifies permission denial only after successful state verification', () => {
    expect(run('io-permissions').stdout).toBe('uid10001-access-denied');
    expect(fixture.read('permission-tests.log')).toContain('-r');
    expect(
      fixture
        .read('privilege.log')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)[0]),
    ).toEqual(['setpriv']);
  });

  it('distinguishes a denied write predicate after both read predicates succeed', () => {
    expect(run('io-write-denied').stdout).toBe('uid10001-access-denied');
    expect(fixture.read('permission-tests.log').trim().split('\n')).toHaveLength(3);
    expect(fixture.read(WAGO_DOUT)).toBe('2');
  });

  it.each(['privilege-tools-unavailable', 'privilege-timeout', 'privilege-transitions-failed'])(
    'fails closed on tool failure: %s',
    (fault) => {
      expect(run(fault).stdout).toBe('permission-tool-unavailable');
      expect(existsSync(join(fixture.root, 'permission-tests.log'))).toBe(false);
      if (fault === 'privilege-transitions-failed') {
        expect(
          fixture
            .read('privilege.log')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)[0]),
        ).toEqual(['setpriv', 'capsh']);
      }
    },
  );

  it.each(['setpriv-transition-failed', 'setpriv-verifier-failed'])(
    'tries capsh when GNU help matches but %s',
    (fault) => {
      if (fault === 'setpriv-verifier-failed') {
        fixture.file(
          'privilege-status-setpriv',
          fixture.read('privilege-status').replace('CapBnd: 0000000000000000', 'CapBnd: 0000000000000001'),
        );
      }
      const result = run(fault);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('accessible');
      expect(
        fixture
          .read('privilege.log')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)[0]),
      ).toEqual(['setpriv', 'capsh']);
      expect(fixture.read('permission-tests.log').trim().split('\n')).toHaveLength(3);
    },
  );

  it.each(['privilege-delayed', 'privilege-deadline'])(
    'waits for termination and reaping before the next observation: %s',
    (fault) => {
      const result = run(fault, `printf '%s\\n' '{"event":"observation"}' >> "$FIXTURE_ROOT/privilege-lifecycle.log"`);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(fault === 'privilege-delayed' ? 'accessible' : 'permission-tool-unavailable');
      const events = fixture
        .read('privilege-lifecycle.log')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const tools = fault === 'privilege-delayed' ? ['setpriv'] : ['setpriv', 'capsh'];
      expect(events.map(({ event, tool }) => (tool ? `${tool}:${event}` : event))).toEqual([
        ...tools.flatMap((tool) => [`${tool}:started`, `${tool}:exit`, `${tool}:reaped`]),
        'observation',
      ]);
      for (const tool of tools) {
        const started = events.find((entry) => entry.tool === tool && entry.event === 'started');
        const exited = events.find((entry) => entry.tool === tool && entry.event === 'exit');
        const reaped = events.find((entry) => entry.tool === tool && entry.event === 'reaped');
        expect(exited).toMatchObject({ pid: started.pid, status: fault === 'privilege-delayed' ? 0 : 124 });
        expect(reaped).toMatchObject({ pid: started.pid, status: exited.status });
        expect(reaped.error).toBe(fault === 'privilege-deadline' ? 'ETIMEDOUT' : undefined);
        expect(existsSync(join(fixture.root, `privilege-live-${tool}`))).toBe(false);
        // Signal 0 checks only the recorded local mock PID; it sends no signal.
        expect(() => process.kill(started.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
      }
    },
    15000,
  );

  it('supports capsh without setpriv and rejects absence of both tools', () => {
    rmSync(join(fixture.root, 'bin/setpriv'));
    expect(run().stdout).toBe('accessible');
    rmSync(join(fixture.root, 'bin/capsh'));
    expect(run().stdout).toBe('permission-tool-unavailable');
  });

  it('rejects missing timeout or unreadable process state', () => {
    rmSync(join(fixture.root, 'privilege-status'));
    expect(run().stdout).toBe('permission-tool-unavailable');
    rmSync(join(fixture.root, 'bin/timeout'));
    expect(run().stdout).toBe('permission-tool-unavailable');
    expect(existsSync(join(fixture.root, 'permission-tests.log'))).toBe(false);
  });

  it('uses a bounded foreground transition with a builtin-only child before host observation', () => {
    expect(wagoPrivilegeProbeShell()).toContain('timeout -k 5 10 "$cli" "$@"');
    expect(wagoPrivilegeVerificationShell()).toContain('done < /proc/$$/status');
    expect(wagoPrivilegeVerificationShell()).not.toMatch(/\b(exec|sleep|cat|id|awk|chmod|chown)\b|[^&]&[^&]/);
  });
});
