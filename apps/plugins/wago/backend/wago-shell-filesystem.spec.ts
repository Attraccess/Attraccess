import { chmodSync, existsSync, linkSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';

describe('root-owned commissioning filesystem and lock boundary', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const config = 'etc/attraccess-wago';
  const lock = config + '/install.lock';
  const guard = (options?: Parameters<typeof wagoShellFilesystemGuard>[0]) =>
    `set -eu
umask 077
root='${fixture.root}'
config="$root/${config}"
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard(options)}
echo guarded`;
  const owner = (path: string, value: string) =>
    fixture.file('owners.json', JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), ['/' + path]: value }));

  beforeEach(() => (fixture = fw31ShellFixture()));
  afterEach(() => fixture.dispose());

  it('creates a private regular lock without modifying an existing valid lock', () => {
    expect(fixture.run(guard()).status).toBe(0);
    expect(statSync(join(fixture.root, lock)).mode & 0o777).toBe(0o600);
    fixture.file(lock, 'existing lock contents');
    expect(fixture.run(guard()).status).toBe(0);
    expect(fixture.read(lock)).toBe('existing lock contents');
  });

  it.each(['configuration', 'parent'])('rejects a non-root-owned %s directory without changing ownership', (path) => {
    const target = path === 'configuration' ? config : 'etc';
    owner(target, '10001:10001');
    const before = fixture.read('owners.json');
    expect(fixture.run(guard()).stderr).toContain('ownership');
    expect(fixture.read('owners.json')).toBe(before);
    expect(existsSync(join(fixture.root, lock))).toBe(false);
  });

  it('fails closed on unavailable ownership observations before creating the lock', () => {
    fixture.file('bin/stat', '#!/bin/sh\nexit 1\n', 0o700);
    expect(fixture.run(guard()).status).not.toBe(0);
    expect(existsSync(join(fixture.root, lock))).toBe(false);
  });

  it.each([0o755, 0o770, 0o777])('rejects an existing configuration directory with mode %s', (mode) => {
    chmodSync(join(fixture.root, config), mode);
    expect(fixture.run(guard()).stderr).toContain('configuration ownership or permissions');
    expect(statSync(join(fixture.root, config)).mode & 0o777).toBe(mode);
    expect(existsSync(join(fixture.root, lock))).toBe(false);
  });

  it('rejects a symlinked lock before opening or truncating its target', () => {
    fixture.file('target', 'preserve target');
    symlinkSync(join(fixture.root, 'target'), join(fixture.root, lock));
    expect(fixture.run(guard()).stderr).toContain('Unsafe controller lock');
    expect(fixture.read('target')).toBe('preserve target');
  });

  it('rejects a hardlinked lock before opening its shared inode', () => {
    fixture.file('target', 'preserve target');
    linkSync(join(fixture.root, 'target'), join(fixture.root, lock));
    expect(fixture.run(guard()).stderr).toContain('Unsafe controller lock');
    expect(fixture.read('target')).toBe('preserve target');
  });

  it('rejects a non-root-owned lock without claiming or truncating it', () => {
    fixture.file(lock, 'untrusted lock');
    owner(lock, '10001:10001');
    expect(fixture.run(guard()).stderr).toContain('Unsafe controller lock');
    expect(fixture.read(lock)).toBe('untrusted lock');
  });

  it('rejects an overly permissive lock and a lock directory', () => {
    fixture.file(lock, 'untrusted lock', 0o666);
    expect(fixture.run(guard()).stderr).toContain('Unsafe controller lock');
    fixture.file(config + '/supervisor.lock/value', 'directory');
    expect(fixture.run(guard({ lockName: 'supervisor.lock', descriptor: 8 })).stderr).toContain(
      'Unsafe controller lock',
    );
  });

  it('revalidates an already held lock without recreating a missing lock', () => {
    expect(fixture.run(guard({ acquireLock: false })).stderr).toContain('Unsafe controller lock');
    expect(existsSync(join(fixture.root, lock))).toBe(false);
    fixture.file(lock, 'held');
    expect(fixture.run(guard({ acquireLock: false })).status).toBe(0);
  });

  it('uses a separate private lock for supervisor ownership', () => {
    const result = fixture.run(guard({ lockName: 'supervisor.lock', descriptor: 8 }));
    expect(result.status).toBe(0);
    expect(existsSync(join(fixture.root, config, 'supervisor.lock'))).toBe(true);
    expect(existsSync(join(fixture.root, lock))).toBe(false);
  });

  it('accepts a root-owned directory alias only while its target is protected', () => {
    fixture.file('persistent/lib/value', 'fixture');
    symlinkSync(join(fixture.root, 'persistent/lib'), join(fixture.root, 'alias'));
    const check = guard() + '\nwago_require_root_directory_or_alias "$root/alias"';
    expect(fixture.run(check).status).toBe(0);
    chmodSync(join(fixture.root, 'persistent/lib'), 0o777);
    expect(fixture.run(check).status).not.toBe(0);
    chmodSync(join(fixture.root, 'persistent/lib'), 0o700);
    owner('alias', '10001:10001');
    expect(fixture.run(check).status).not.toBe(0);
  });

  it.each(['owner', 'group-writable', 'world-writable', 'alias-owner'])(
    'rejects an unsafe intermediate alias ancestor without repairing it: %s',
    (fault) => {
      fixture.file('storage/untrusted/var/lib/value', 'protected leaf');
      symlinkSync(join(fixture.root, 'storage/untrusted/var'), join(fixture.root, 'alias'));
      if (fault === 'owner') owner('storage/untrusted', '2000:2000');
      if (fault === 'group-writable') chmodSync(join(fixture.root, 'storage/untrusted'), 0o770);
      if (fault === 'world-writable') chmodSync(join(fixture.root, 'storage/untrusted'), 0o777);
      if (fault === 'alias-owner') {
        symlinkSync('storage/untrusted', join(fixture.root, 'intermediate'));
        symlinkSync('intermediate/var', join(fixture.root, 'second-alias'));
        owner('intermediate', '2000:2000');
      }
      const before = fixture.read('owners.json');
      const path = fault === 'alias-owner' ? 'second-alias' : 'alias';
      expect(fixture.run(guard() + `\nwago_require_root_directory_or_alias "$root/${path}/lib"`).status).not.toBe(0);
      expect(fixture.read('owners.json')).toBe(before);
      expect(fixture.read('storage/untrusted/var/lib/value')).toBe('protected leaf');
    },
  );

  it('checks relative aliases, repeated separators and ancestors before parent traversal', () => {
    fixture.file('storage/var/lib/value', 'protected leaf');
    fixture.file('storage/intermediate/value', 'parent');
    symlinkSync('storage/intermediate/../var', join(fixture.root, 'alias'));
    const check = guard() + '\nwago_require_root_directory_or_alias "$root//alias//lib"';
    expect(fixture.run(check).status).toBe(0);
    chmodSync(join(fixture.root, 'storage/intermediate'), 0o777);
    expect(fixture.run(check).status).not.toBe(0);
  });

  it('fails closed on a symlink cycle and on an alias escaping the isolated root', () => {
    symlinkSync('loop', join(fixture.root, 'loop'));
    symlinkSync('/private/tmp', join(fixture.root, 'escape'));
    for (const path of ['loop', 'escape']) {
      expect(fixture.run(guard() + `\nwago_require_root_directory_or_alias "$root/${path}"`).status).not.toBe(0);
    }
  });
});
