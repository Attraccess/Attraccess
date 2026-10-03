import { chmodSync, existsSync, linkSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { managedWatchdogScript } from './wago-managed-provision';
import { sshLockRecoveryScript } from './wago-ssh-lock-recovery';

const hardwareId = 'cc100-979e17dc42de34a1';

function installation(statStyle: 'native' | 'terse' = 'native') {
  const fixture = fw31ShellFixture(statStyle);
  fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
  fixture.file('etc/attraccess-wago/install.lock', '');
  fixture.file('etc/attraccess-wago/runtime.env', `WAGO_HARDWARE_ID=${hardwareId}\nMQTT=preserved-fixture\n`);
  fixture.file('etc/attraccess-wago-management/cutover', '');
  fixture.file('etc/attraccess-wago-management/dropbear.previous', '#!/bin/sh\necho previous-SSH-policy\n', 0o700);
  fixture.file('etc/init.d/dropbear', '#!/bin/sh\necho restricted-SSH-policy\n', 0o755);
  fixture.file('usr/sbin/attraccess-wago-management', '#!/bin/sh\nexec 7>/dev/null\nflock -w 30 7\n', 0o700);
  fixture.file(
    'etc/attraccess-wago-management/watchdog',
    managedWatchdogScript(fixture.root).replace('umask 077\n', '').replaceAll('timeout -k 5 30 flock 7', 'flock -w 30 7'),
    0o700,
  );
  return fixture;
}

it.each(['native', 'terse'] as const)('repairs an actual unsupported FW31 rollback and preserves controller configuration (%s)', statStyle => {
  const fixture = installation(statStyle);
  try {
    const env = fixture.read('etc/attraccess-wago/runtime.env');
    const oldWatchdog = fixture.read('etc/attraccess-wago-management/watchdog');
    const original = fixture.run(`umask 022\nset -- restore\n${oldWatchdog}`);
    expect(original.status).toBe(1);
    expect(original.stderr).toContain("flock: invalid option -- 'w'");
    const lock = join(fixture.root, 'etc/attraccess-wago-management/access.lock');
    const originalLock = statSync(lock);
    expect(originalLock.mode & 0o777).toBe(0o644);
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/cutover'))).toBe(true);
    const recovery = sshLockRecoveryScript(hardwareId, fixture.root);
    const result = fixture.run(recovery);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout).toContain('previous SSH access restored');
    expect(statSync(lock).ino).toBe(originalLock.ino);
    expect(statSync(lock).mode & 0o777).toBe(0o600);
    expect(fixture.read('usr/sbin/attraccess-wago-management')).toContain('timeout -k 5 30 flock 7');
    expect(fixture.read('etc/attraccess-wago-management/watchdog')).not.toContain('flock -w');
    expect(fixture.read('etc/attraccess-wago-management/watchdog')).toContain('umask 077');
    expect(fixture.read('etc/init.d/dropbear')).toContain('previous-SSH-policy');
    expect(fixture.read('etc/attraccess-wago/runtime.env')).toBe(env);
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/cutover'))).toBe(false);
    expect(fixture.run(recovery).status).toBe(0);
  } finally {
    fixture.dispose();
  }
});

it.each(['foreign-controller', 'committed', 'busy', 'unsafe-watchdog'])(
  'refuses %s recovery without changing SSH scripts', fault => {
    const fixture = installation();
    try {
      fixture.file('etc/attraccess-wago-management/access.lock', '');
      const watchdog = fixture.read('etc/attraccess-wago-management/watchdog');
      if (fault === 'committed') fixture.file('etc/attraccess-wago-management/committed', '');
      if (fault === 'unsafe-watchdog') chmodSync(join(fixture.root, 'etc/attraccess-wago-management/watchdog'), 0o755);
      const result = fixture.run(
        sshLockRecoveryScript(fault === 'foreign-controller' ? 'cc100-0000000000000000' : hardwareId, fixture.root),
        fault === 'busy' ? 'lock-wait-expired' : '',
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain({
        'foreign-controller': 'Package belongs to a different CC100',
        committed: 'SSH access was already confirmed',
        busy: 'Another runtime transaction holds the controller lock',
        'unsafe-watchdog': 'Unsafe management executable',
      }[fault]);
      expect(fixture.read('etc/attraccess-wago-management/watchdog')).toBe(watchdog);
      expect(fixture.read('usr/sbin/attraccess-wago-management')).toContain('flock -w');
      expect(fixture.read('etc/init.d/dropbear')).toContain('restricted-SSH-policy');
    } finally {
      fixture.dispose();
    }
  },
);

it.each(['missing', 'writable', 'symlink', 'hardlink', 'foreign-owner'] as const)(
  'explains and refuses an unsafe %s transition lock', fault => {
    const fixture = installation();
    try {
      const path = join(fixture.root, 'etc/attraccess-wago-management/access.lock');
      if (fault === 'symlink') symlinkSync('cutover', path);
      else if (fault === 'hardlink') linkSync(join(fixture.root, 'etc/attraccess-wago-management/cutover'), path);
      else if (fault !== 'missing') fixture.file('etc/attraccess-wago-management/access.lock', '', fault === 'writable' ? 0o664 : 0o600);
      if (fault === 'writable') chmodSync(path, 0o664);
      if (fault === 'foreign-owner') {
        const owners = JSON.parse(fixture.read('owners.json'));
        owners['/etc/attraccess-wago-management/access.lock'] = '10001:0';
        fixture.file('owners.json', JSON.stringify(owners));
      }
      const result = fixture.run(sshLockRecoveryScript(hardwareId, fixture.root));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain({
        missing: 'lock is missing or is not a regular file',
        writable: 'uid:gid:mode:links=0:0:664:1',
        symlink: 'lock is a symbolic link',
        hardlink: 'uid:gid:mode:links=0:0:600:2',
        'foreign-owner': 'uid:gid:mode:links=10001:0:600:1',
      }[fault]);
      expect(fixture.read('usr/sbin/attraccess-wago-management')).toContain('flock -w');
      expect(fixture.read('etc/init.d/dropbear')).toContain('restricted-SSH-policy');
    } finally {
      fixture.dispose();
    }
  },
);

it('also repairs a legacy installation with an already-private lock', () => {
  const fixture = installation();
  try {
    fixture.file('etc/attraccess-wago-management/access.lock', '');
    const result = fixture.run(sshLockRecoveryScript(hardwareId, fixture.root));
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  } finally {
    fixture.dispose();
  }
});

it('creates new rollback locks privately even with an inherited public umask', () => {
  const fixture = installation();
  try {
    const result = fixture.run(`umask 022\nset -- restore\n${managedWatchdogScript(fixture.root)}`);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(statSync(join(fixture.root, 'etc/attraccess-wago-management/access.lock')).mode & 0o777).toBe(0o600);
  } finally {
    fixture.dispose();
  }
});
