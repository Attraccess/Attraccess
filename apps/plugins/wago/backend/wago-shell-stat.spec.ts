import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { registerReportsExactFileSizeWithoutReadingItsContentsS } from './wago-shell-stat.test-cases';
import { registerCachesSModeAcrossObservationsPreservingCallerAndNestedArguments } from './wago-shell-stat.test-cases';
import { registerIgnoresInheritedCacheInjectionS } from './wago-shell-stat.test-cases';
import { registerNeverDetectsCapabilitiesAgainAfterANativeFileError } from './wago-shell-stat.test-cases';
import { registerFailsClosedOnAMissingRealFileInCachedSMode } from './wago-shell-stat.test-cases';
import { registerEnforcesTheExactHelpCaptureByteBoundaryAtI } from './wago-shell-stat.test-cases';
import { registerStillValidatesEachObservationAfterCachingCase } from './wago-shell-stat.still-validates-each-observation-after-caching-case.test-cases';
import { registerEmitsTheKnownFormatS } from './wago-shell-stat.test-cases';
import { registerParsesTheOtherOwnerCapturedTerseRecords } from './wago-shell-stat.test-cases';
import { registerRejectsMalformedOrOversizedRecordsWithoutOutput } from './wago-shell-stat.test-cases';
import { registerFailsClosedOnFailedObservationsAndUnexpectedVariantsJ } from './wago-shell-stat.test-cases';
import { registerPreservesSpecialModeBitsAndDistinguishesSymlinkFromTargetMetadata } from './wago-shell-stat.test-cases';
import { registerEmbedsTheAdapterInFilesystemHostIoAndStandaloneSupervisorEmitters } from './wago-shell-stat.test-cases';

const quote = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;
const fields = '4096 8 41ed 0 0 b305 7779 45 0 0 1733011200 1654229446 1654229446 4096';

describe('FW31 source-backed stat metadata adapter', () => {
  defineFw31SourceBackedStatMetadataAdapterTests();
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

export function defineFw31SourceBackedStatMetadataAdapterTests() {
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
  const scope = {
    get root() {
      return root;
    },
    set root(value: typeof root) {
      root = value;
    },
    get run() {
      return run;
    },
    get quote() {
      return quote;
    },
    get runScript() {
      return runScript;
    },
    get fields() {
      return fields;
    },
  };

  registerReportsExactFileSizeWithoutReadingItsContentsS(scope);

  registerCachesSModeAcrossObservationsPreservingCallerAndNestedArguments(scope);

  registerIgnoresInheritedCacheInjectionS(scope);

  registerNeverDetectsCapabilitiesAgainAfterANativeFileError(scope);

  registerFailsClosedOnAMissingRealFileInCachedSMode(scope);

  registerEnforcesTheExactHelpCaptureByteBoundaryAtI(scope);

  registerStillValidatesEachObservationAfterCachingCase(scope);

  registerEmitsTheKnownFormatS(scope);

  registerParsesTheOtherOwnerCapturedTerseRecords(scope);

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

  registerRejectsMalformedOrOversizedRecordsWithoutOutput(scope);

  registerFailsClosedOnFailedObservationsAndUnexpectedVariantsJ(scope);

  it('uses native formats when available without falling back after a failed observation', () => {
    expect(run(undefined, { NATIVE: '12:34:700:2\n' }).stdout).toBe('12:34:700:2\n');
    expect(run(undefined, { NATIVE: '0:0:700:1\n', STATUS: '1' }).status).not.toBe(0);
    expect(run(undefined, { NATIVE: '0:0:700:1\nextra\n' }).status).not.toBe(0);
  });

  registerPreservesSpecialModeBitsAndDistinguishesSymlinkFromTargetMetadata(scope);

  it('rejects unsupported formats and newline paths', () => {
    expect(run('%n').status).not.toBe(0);
    expect(run('%u', {}, '/line\nbreak').status).not.toBe(0);
    expect(run('%u', { NULL_PREFIX: '1' }, '/a?b').status).not.toBe(0);
  });

  registerEmbedsTheAdapterInFilesystemHostIoAndStandaloneSupervisorEmitters(scope);

  return scope;
}

export type Fw31SourceBackedStatMetadataAdapterTestScope = ReturnType<
  typeof defineFw31SourceBackedStatMetadataAdapterTests
>;
