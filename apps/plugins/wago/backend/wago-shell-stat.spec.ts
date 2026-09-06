import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
if (args[0]==='--help') {
  console.log(env.HELP || 'BusyBox v1.37.0 () multi-call binary.\\n\\nUsage: stat [-ltf] FILE...'); process.exit(0);
}
if (args[0].includes('c')) {
  if (!env.NATIVE) process.exit(1);
  if (args.at(-1)===env.ROOT) { console.log('0:0:700'); process.exit(0); }
  process.stdout.write(env.NATIVE); process.exit(Number(env.STATUS || 0));
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
  const run = (format = '%u:%g:%a:%h', env: Record<string, string> = {}, path = '/etc', follow = false) =>
    spawnSync(
      '/bin/sh',
      [
        '-c',
        `set -eu\nroot=${quote(root)}\n${wagoShellStat()}\nstat ${follow ? '-Lc' : '-c'} ${quote(format)} ${quote(path)}`,
      ],
      {
        env: { ...process.env, PATH: `${root}:${process.env.PATH}`, ROOT: root, FIELDS: fields, ...env },
        encoding: 'utf8',
        timeout: 5000,
      },
    );

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
