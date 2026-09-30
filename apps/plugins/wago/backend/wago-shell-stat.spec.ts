import { spawnSync } from 'node:child_process';
import { chmodSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wagoShellStat } from './wago-shell-stat';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import {
  wagoCommissioningPreparationScript,
  wagoDockerProvisionRecoveryScript,
  wagoHardwareDeploymentReportScript,
} from './wago-hardware-deployment';
import {
  runtimeBundleInstallScript,
  runtimeBundleRecoveryScript,
  runtimeBundleRecoveryAcknowledgementScript,
} from './wago-runtime-install';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { wagoHostIoGuardShell } from './wago-host-io-guard';
import { wagoRuntimeSupervisorAcknowledgeShell, wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';

const quote = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;
const fields = '4096 8 41ed 0 0 b305 7779 45 0 0 1733011200 1654229446 1654229446 4096';

describe('FW31 source-backed stat metadata adapter', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wago-stat-'));
    writeFileSync(
      join(root, 'stat'),
      `#!${process.execPath}
const fs=require('node:fs'), args=process.argv.slice(2), env=process.env;
if(env.CALLS) fs.appendFileSync(env.CALLS,JSON.stringify(args)+'\\n');
if (args[0]==='--help') {
  process.stdout.write((env.HELP || 'BusyBox v1.37.0 () multi-call binary.\\n\\nUsage: stat [-ltf] FILE...\\n')+(env.HELP_NULL?String.fromCharCode(0):'')); process.exit(Number(env.HELP_STATUS || 0));
}
if (args[0].includes('c')) {
  if (!env.NATIVE) process.exit(1);
  if (args.at(-1)===env.ROOT) { console.log('0:0:700'); process.exit(0); }
  if(env.NATIVE_REAL) {
    const s=(args[0]==='-Lc'?fs.statSync:fs.lstatSync)(args[2],{bigint:true});
    const values={'%u':s.uid,'%g':s.gid,'%a':(s.mode&4095n).toString(8),'%h':s.nlink,'%d':s.dev,'%i':s.ino};
    console.log(args[1].replace(/%[ugahdi]/g,v=>values[v]));process.exit(0);
  }
  process.stdout.write(env.NATIVE+(env.NATIVE_NULL?String.fromCharCode(0):'')); process.exit(Number(env.STATUS || 0));
}
if (!['-t','-Lt'].includes(args[0]) || args.length!==2) process.exit(99);
let fields=env.FIELDS;
if (env.REAL) {
  const s=(args[0]==='-Lt'?fs.statSync:fs.lstatSync)(args[1],{bigint:true});
  fields=[s.size,s.blocks,s.mode.toString(16),s.uid,s.gid,s.dev.toString(16),s.ino,s.nlink,'0','0','1','1','1',s.blksize].join(' ');
}
const prefix=env.NULL_PREFIX?args[1].replace('?',String.fromCharCode(0)):(env.PREFIX || args[1]);
process.stdout.write(prefix+' '+fields+(env.NULL_BYTE?String.fromCharCode(0):'')+(env.SUFFIX === undefined?'\\n':env.SUFFIX));
process.exit(Number(env.STATUS || 0));
`,
      { mode: 0o700 },
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const runScript = (script: string, env: Record<string, string> = {}) =>
    spawnSync('/bin/sh', ['-c', `set -eu\nroot=${quote(root)}\n${script}`], {
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, ROOT: root, FIELDS: fields, ...env },
      encoding: 'utf8',
      timeout: 15000,
    });
  const run = (format = '%u:%g:%a:%h', env: Record<string, string> = {}, path = '/etc', follow = false) =>
    runScript(`${wagoShellStat()}\nstat ${follow ? '-Lc' : '-c'} ${quote(format)} ${quote(path)}`, env);

  it.each(['native', 'terse'])('caches %s mode across observations, preserving caller and nested arguments', (mode) => {
    const helper = wagoShellStat();
    const calls = join(root, 'calls');
    const target = join(root, 'target');
    writeFileSync(target, 'real unprivileged fixture');
    linkSync(target, join(root, 'hardlink'));
    symlinkSync(target, join(root, 'alias'));
    const formats = ['%u', '%u:%a', '%u:%a:%h', '%u:%g', '%u:%g:%a', '%u:%g:%a:%h', '%d:%i'];
    const observations = formats
      .flatMap((format) =>
        ['-c', '-Lc'].map(
          (flag) =>
            `value=$(stat ${flag} ${quote(format)} ${quote(flag === '-Lc' ? join(root, 'alias') : target)}) || exit 1\nprintf '%s\\n' "$value"`,
        ),
      )
      .join('\n');
    const started = performance.now();
    const result = runScript(
      `
set -- 'Docker CA with spaces' '' '*;literal'
${helper}
${observations}
check_nested() (
  test "$#" = 2 && test "$1" = nested && test "$2" = 'CA argument'
  ${helper}
  ${observations}
  test "$#" = 2 && test "$1" = nested && test "$2" = 'CA argument'
)
check_nested nested 'CA argument'
${helper}
${observations}
test "$#" = 3 && test "$1" = 'Docker CA with spaces' && test "$2" = '' && test "$3" = '*;literal'
`,
      { CALLS: calls, REAL: '1', ...(mode === 'native' ? { NATIVE: '1', NATIVE_REAL: '1' } : {}) },
    );
    const elapsedMs = Math.round(performance.now() - started);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(42);
    const s = statSync(target, { bigint: true });
    const values: Record<string, string> = {
      '%u': String(s.uid),
      '%g': String(s.gid),
      '%a': (s.mode & BigInt(0o7777)).toString(8),
      '%h': String(s.nlink),
      '%d': String(s.dev),
      '%i': String(s.ino),
    };
    expect(lines.slice(0, 14)).toEqual(
      formats.flatMap((format) => Array(2).fill(format.replace(/%[ugahdi]/g, (field) => values[field]))),
    );
    expect(lines.slice(14, 28)).toEqual(lines.slice(0, 14));
    expect(lines.slice(28)).toEqual(lines.slice(0, 14));
    expect(lines[4]).toMatch(/:2$/);
    const invoked: string[][] = readFileSync(calls, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const help = invoked.filter(([flag]) => flag === '--help').length;
    const native = invoked.filter(([flag]) => flag.includes('c')).length;
    const terse = invoked.filter(([flag]) => ['-t', '-Lt'].includes(flag)).length;
    process.stdout.write(
      `source-only stat fixture: ${JSON.stringify({ mode, observations: 42, emissions: 3, elapsedMs, help, native, terse })}\n`,
    );
    expect({ help, native, terse }).toEqual(
      mode === 'native' ? { help: 0, native: 45, terse: 0 } : { help: 3, native: 3, terse: 45 },
    );
  });

  it.each(['native', 'terse', 'probe', 'invalid'])('ignores inherited cache injection %s', (mode) => {
    const result = run('%u', {
      wago_stat_mode: mode,
      WAGO_STAT_MODE: mode,
      HELP: 'unknown stat tool',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });

  it('never detects capabilities again after a native file error', () => {
    const calls = join(root, 'calls');
    const result = run('%u', { CALLS: calls, NATIVE: '0\n', STATUS: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(readFileSync(calls, 'utf8')).not.toContain('--help');
    expect(readFileSync(calls, 'utf8')).not.toContain('"-t"');
  });

  it.each(['native', 'terse'])('fails closed on a missing real file in cached %s mode', (mode) => {
    const result = run(
      '%u',
      {
        REAL: '1',
        ...(mode === 'native' ? { NATIVE: '1', NATIVE_REAL: '1' } : {}),
      },
      join(root, 'missing'),
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it.each([8192, 8193])('enforces the exact help capture byte boundary at %i', (bytes) => {
    const header = 'BusyBox v1.37.0 () multi-call binary.\nUsage: stat [-ltf] FILE...\n';
    const markerBytes = '\nWAGO_STAT_OK'.length;
    const result = run('%u', { HELP: header + 'x'.repeat(bytes - markerBytes - header.length) });
    expect(result.status === 0).toBe(bytes === 8192);
    expect(result.stdout).toBe(bytes === 8192 ? '0\n' : '');
  });

  it.each([
    { STATUS: '1' },
    { FIELDS: fields.replace('7779', '18446744073709551616'), NATIVE: '0:0:888:1\n' },
    { SUFFIX: '', NATIVE: '0:0:700:1' },
    { NULL_BYTE: '1', NATIVE_NULL: '1' },
    { SUFFIX: '\n\nWAGO_STAT_OK', NATIVE: '0:0:700:1\n\nWAGO_STAT_OK', STATUS: '1' },
    { SUFFIX: '\n\nWAGO_STAT_OK' + '\n'.repeat(9000), NATIVE: '0:0:700:1\n\nWAGO_STAT_OK' + '\n'.repeat(9000) },
  ])('still validates each observation after caching: case %#', (fault) => {
    for (const mode of ['native', 'terse']) {
      const calls = join(root, 'calls-' + mode);
      const assignments = Object.entries(fault)
        .filter(([key]) => mode === 'native' || !key.startsWith('NATIVE'))
        .map(([key, value]) => `export ${key}=${quote(value)}`)
        .join('\n');
      const result = runScript(`${wagoShellStat()}\n${assignments}\nstat -c '%u:%g:%a:%h' /etc`, {
        CALLS: calls,
        ...(mode === 'native' ? { NATIVE: '0:0:700:1\n' } : {}),
      });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      const invoked: string[][] = readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(invoked.filter(([flag]) => flag === '--help')).toHaveLength(mode === 'native' ? 0 : 1);
      expect(invoked).toHaveLength(mode === 'native' ? 2 : 4);
    }
  });

  it.each([
    ['%u', '0'],
    ['%u:%a', '0:755'],
    ['%u:%a:%h', '0:755:45'],
    ['%u:%g', '0:0'],
    ['%u:%g:%a', '0:0:755'],
    ['%u:%g:%a:%h', '0:0:755:45'],
    ['%d:%i', '45829:7779'],
  ])('emits the known format %s', (format, expected) => {
    const result = run(format);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(expected + '\n');
  });

  it.each([
    ['22 8 81a4 0 0 b305 15 1 0 0 1654438928 1733011200 1654224915 4096', '0:0:644:1'],
    ['4096 8 41c0 0 0 b305 1233 2 0 0 1654403010 1654227162 1654229395 4096', '0:0:700:2'],
    ['4096 0 81a4 0 0 15 16612 1 0 0 1654226352 1654226352 1654226352 4096', '0:0:644:1'],
  ])('parses the other owner-captured terse records', (record, expected) => {
    expect(run(undefined, { FIELDS: record }).stdout).toBe(expected + '\n');
  });

  it('preserves large device and inode identities exactly', () => {
    expect(run('%d:%i', { FIELDS: fields.replace('b305 7779', 'ffffffffffffffff 18446744073709551615') }).stdout).toBe(
      '18446744073709551615:18446744073709551615\n',
    );
  });

  it('observes anonymous inodes without inventing file-type bits', () => {
    expect(run('%d:%i', { FIELDS: fields.replace('41ed', '180') }).stdout).toBe('45829:7779\n');
  });

  it.each(["/a path/*?[x];$(false) 'quote\\backslash", '-option', '/tab\tname'])(
    'treats %s as literal path data',
    (path) => {
      expect(run('%u', {}, path).stdout).toBe('0\n');
    },
  );

  it.each([
    fields.split(' ').slice(0, -1).join(' '),
    fields + ' 0',
    fields.replace('41ed', 'ffff'),
    fields.replace('b305', 'gggg'),
    fields.replace('7779', '1e3'),
    fields.replace('7779', '18446744073709551616'),
    fields.replace(' 0 0 b305', ' -1 0 b305'),
    fields.replace('4096 8', '4096  8'),
    fields + '\n' + fields,
    'x'.repeat(9000),
  ])('rejects malformed or oversized records without output', (record) => {
    const result = run(undefined, { FIELDS: record });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });

  it.each([
    { STATUS: '1' },
    { PREFIX: '/wrong-path' },
    { HELP: 'BusyBox v1.36.0 () multi-call binary.\nUsage: stat [-ltf] FILE...' },
    { HELP: 'BusyBox v1.37.0 () multi-call binary.\nUsage: stat [-c FORMAT] FILE...' },
    { SUFFIX: '\n\n' },
    { SUFFIX: '' },
    { NULL_BYTE: '1' },
    { HELP_STATUS: '1' },
    { HELP: 'BusyBox v1.37.0 () multi-call binary.\nUsage: stat [-ltf] FILE...\n\nWAGO_STAT_OK', HELP_STATUS: '1' },
    { HELP: 'BusyBox v1.37.0 () multi-call binary.\nUsage: stat [-ltf] FILE...\n\nWAGO_STAT_OK' + '\n'.repeat(9000) },
    { HELP_NULL: '1' },
    { SUFFIX: '\n\nWAGO_STAT_OK', STATUS: '1' },
    { SUFFIX: '\n\nWAGO_STAT_OK' + '\n'.repeat(9000) },
    { NATIVE: '0:0:700:1\n\nWAGO_STAT_OK', STATUS: '1' },
    { NATIVE: '0:0:700:1\n\nWAGO_STAT_OK' + '\n'.repeat(9000) },
    { NATIVE: '0:0:700:1\n', NATIVE_NULL: '1' },
    { NATIVE: '0:0:700:1' },
  ])('fails closed on failed observations and unexpected variants: %j', (env) => {
    const result = run(undefined, env);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });

  it('uses native formats when available without falling back after a failed observation', () => {
    expect(run(undefined, { NATIVE: '12:34:700:2\n' }).stdout).toBe('12:34:700:2\n');
    expect(run(undefined, { NATIVE: '0:0:700:1\n', STATUS: '1' }).status).not.toBe(0);
    expect(run(undefined, { NATIVE: '0:0:700:1\nextra\n' }).status).not.toBe(0);
  });

  it('preserves special mode bits and distinguishes symlink from target metadata', () => {
    const target = join(root, 'target');
    writeFileSync(target, 'fixture');
    chmodSync(target, 0o600);
    const alias = join(root, 'alias');
    symlinkSync(target, alias);
    expect(run('%d:%i', { REAL: '1' }, alias).stdout).not.toBe(run('%d:%i', { REAL: '1' }, target).stdout);
    expect(run('%d:%i', { REAL: '1' }, alias, true).stdout).toBe(run('%d:%i', { REAL: '1' }, target).stdout);
    expect(run('%u:%g:%a', { FIELDS: fields.replace('41ed', '4fed') }).stdout).toBe('0:0:7755\n');
  });

  it('rejects unsupported formats and newline paths', () => {
    expect(run('%n').status).not.toBe(0);
    expect(run('%u', {}, '/line\nbreak').status).not.toBe(0);
    expect(run('%u', { NULL_PREFIX: '1' }, '/a?b').status).not.toBe(0);
  });

  it('embeds the adapter in filesystem, host IO, and standalone supervisor emitters', () => {
    for (const script of [
      wagoShellFilesystemGuard(),
      wagoHostIoGuardShell(),
      wagoRuntimeSupervisorLaunchShell(),
      wagoRuntimeSupervisorAcknowledgeShell(),
    ]) {
      expect(script).toContain(wagoShellStat());
      expect(spawnSync('/bin/sh', ['-n'], { input: script }).status).toBe(0);
    }
  });
});

it.each(['native', 'terse'] as const)(
  'initializes %s metadata in standalone and nested fixture shells without root context',
  (mode) => {
    const fixture = fw31ShellFixture(mode);
    const helper = wagoShellStat();
    const script = `unset root\n${helper}\ntest "$wago_stat_mode" = ${mode}\nstat -c '%u:%g:%a' "$FIXTURE_ROOT"`;
    try {
      const result = fixture.run(`${script}\n/bin/sh -c ${quote(script)}\n${script}`);
      expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({
        status: 0,
        stdout: '0:0:700\n0:0:700\n0:0:700\n',
        stderr: '',
      });
    } finally {
      fixture.dispose();
    }
  },
);

it('carries terse-only metadata through inspection, preparation, install, persisted boot and recovery', () => {
  const fixture = fw31ShellFixture('terse');
  const token = 'a'.repeat(32);
  const image = 'example.invalid/runtime@sha256:' + 'a'.repeat(64);
  const succeeds = (script: string) => {
    const result = fixture.run(script);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    return result.stdout;
  };
  try {
    expect(succeeds(wagoHardwareDeploymentReportScript(fixture.root))).toContain('platform=supported');
    succeeds(wagoCommissioningPreparationScript(token, fixture.root));
    fixture.file('etc/attraccess-wago/delivery/token', token + '\n');
    fixture.file('etc/attraccess-wago/runtime.env.next', 'NEW=enrollment');
    fixture.file('bundle/image-reference', image + '\n');
    fixture.file('bundle/image.tar', 'fixture image bytes');
    expect(
      spawnSync('/usr/bin/tar', [
        '-cf',
        join(fixture.root, 'tmp/attraccess-wago-runtime.tar'),
        '-C',
        join(fixture.root, 'bundle'),
        'image-reference',
        'image.tar',
      ]).status,
    ).toBe(0);
    succeeds(runtimeBundleInstallScript(image, fixture.root));
    expect(succeeds(`${quote(join(fixture.root, 'etc/rc.d/S99_zz_attraccess_wago'))} cycle`)).toBe('running\n');
    succeeds(runtimeBundleRecoveryScript(fixture.root));
    succeeds(runtimeBundleRecoveryAcknowledgementScript(fixture.root, token));
    succeeds(wagoDockerProvisionRecoveryScript(token, fixture.root));
  } finally {
    fixture.dispose();
  }
});
