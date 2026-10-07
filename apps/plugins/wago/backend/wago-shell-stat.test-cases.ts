import { linkSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import { symlinkSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wagoShellStat } from './wago-shell-stat';
import type { Fw31SourceBackedStatMetadataAdapterTestScope } from './wago-shell-stat.spec';
import { spawnSync } from 'node:child_process';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { wagoHostIoGuardShell } from './wago-host-io-guard';
import { wagoRuntimeSupervisorAcknowledgeShell } from './wago-runtime-supervisor';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import { chmodSync } from 'node:fs';

export function registerCachesSModeAcrossObservationsPreservingCallerAndNestedArguments(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it.each(['native', 'terse'])('caches %s mode across observations, preserving caller and nested arguments', (mode) => {
    const helper = wagoShellStat();
    const calls = join(scope.root, 'calls');
    const target = join(scope.root, 'target');
    writeFileSync(target, 'real unprivileged fixture');
    linkSync(target, join(scope.root, 'hardlink'));
    symlinkSync(target, join(scope.root, 'alias'));
    const formats = ['%u', '%u:%a', '%u:%a:%h', '%u:%g', '%u:%g:%a', '%u:%g:%a:%h', '%d:%i'];
    const observations = formats
      .flatMap((format) =>
        ['-c', '-Lc'].map(
          (flag) =>
            `value=$(stat ${flag} ${scope.quote(format)} ${scope.quote(flag === '-Lc' ? join(scope.root, 'alias') : target)}) || exit 1\nprintf '%s\\n' "$value"`,
        ),
      )
      .join('\n');
    const started = performance.now();
    const result = scope.runScript(
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
}

export function registerEmbedsTheAdapterInFilesystemHostIoAndStandaloneSupervisorEmitters(
  _scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
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
}

export function registerEmitsTheKnownFormatS(scope: Fw31SourceBackedStatMetadataAdapterTestScope): void {
  it.each([
    ['%u', '0'],
    ['%u:%a', '0:755'],
    ['%u:%a:%h', '0:755:45'],
    ['%u:%g', '0:0'],
    ['%u:%g:%a', '0:0:755'],
    ['%u:%g:%a:%h', '0:0:755:45'],
    ['%d:%i', '45829:7779'],
  ])('emits the known format %s', (format, expected) => {
    const result = scope.run(format);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(expected + '\n');
  });
}

export function registerEnforcesTheExactHelpCaptureByteBoundaryAtI(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it.each([8192, 8193])('enforces the exact help capture byte boundary at %i', (bytes) => {
    const header = 'BusyBox v1.37.0 () multi-call binary.\nUsage: stat [-ltf] FILE...\n';
    const markerBytes = '\nWAGO_STAT_OK'.length;
    const result = scope.run('%u', { HELP: header + 'x'.repeat(bytes - markerBytes - header.length) });
    expect(result.status === 0).toBe(bytes === 8192);
    expect(result.stdout).toBe(bytes === 8192 ? '0\n' : '');
  });
}

export function registerFailsClosedOnAMissingRealFileInCachedSMode(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it.each(['native', 'terse'])('fails closed on a missing real file in cached %s mode', (mode) => {
    const result = scope.run(
      '%u',
      {
        REAL: '1',
        ...(mode === 'native' ? { NATIVE: '1', NATIVE_REAL: '1' } : {}),
      },
      join(scope.root, 'missing'),
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
}

export function registerFailsClosedOnFailedObservationsAndUnexpectedVariantsJ(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
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
    const result = scope.run(undefined, env);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });
}

export function registerIgnoresInheritedCacheInjectionS(scope: Fw31SourceBackedStatMetadataAdapterTestScope): void {
  it.each(['native', 'terse', 'probe', 'invalid'])('ignores inherited cache injection %s', (mode) => {
    const result = scope.run('%u', {
      wago_stat_mode: mode,
      WAGO_STAT_MODE: mode,
      HELP: 'unknown stat tool',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });
}

export function registerNeverDetectsCapabilitiesAgainAfterANativeFileError(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it('never detects capabilities again after a native file error', () => {
    const calls = join(scope.root, 'calls');
    const result = scope.run('%u', { CALLS: calls, NATIVE: '0\n', STATUS: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(readFileSync(calls, 'utf8')).not.toContain('--help');
    expect(readFileSync(calls, 'utf8')).not.toContain('"-t"');
  });
}

export function registerParsesTheOtherOwnerCapturedTerseRecords(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it.each([
    ['22 8 81a4 0 0 b305 15 1 0 0 1654438928 1733011200 1654224915 4096', '0:0:644:1'],
    ['4096 8 41c0 0 0 b305 1233 2 0 0 1654403010 1654227162 1654229395 4096', '0:0:700:2'],
    ['4096 0 81a4 0 0 15 16612 1 0 0 1654226352 1654226352 1654226352 4096', '0:0:644:1'],
  ])('parses the other owner-captured terse records', (record, expected) => {
    expect(scope.run(undefined, { FIELDS: record }).stdout).toBe(expected + '\n');
  });
}

export function registerPreservesSpecialModeBitsAndDistinguishesSymlinkFromTargetMetadata(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it('preserves special mode bits and distinguishes symlink from target metadata', () => {
    const target = join(scope.root, 'target');
    writeFileSync(target, 'fixture');
    chmodSync(target, 0o600);
    const alias = join(scope.root, 'alias');
    symlinkSync(target, alias);
    expect(scope.run('%d:%i', { REAL: '1' }, alias).stdout).not.toBe(scope.run('%d:%i', { REAL: '1' }, target).stdout);
    expect(scope.run('%d:%i', { REAL: '1' }, alias, true).stdout).toBe(
      scope.run('%d:%i', { REAL: '1' }, target).stdout,
    );
    expect(scope.run('%u:%g:%a', { FIELDS: scope.fields.replace('41ed', '4fed') }).stdout).toBe('0:0:7755\n');
  });
}

export function registerRejectsMalformedOrOversizedRecordsWithoutOutput(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it.each([
    scope.fields.split(' ').slice(0, -1).join(' '),
    scope.fields + ' 0',
    scope.fields.replace('41ed', 'ffff'),
    scope.fields.replace('b305', 'gggg'),
    scope.fields.replace('7779', '1e3'),
    scope.fields.replace('7779', '18446744073709551616'),
    scope.fields.replace(' 0 0 b305', ' -1 0 b305'),
    scope.fields.replace('4096 8', '4096  8'),
    scope.fields + '\n' + scope.fields,
    'x'.repeat(9000),
  ])('rejects malformed or oversized records without output', (record) => {
    const result = scope.run(undefined, { FIELDS: record });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });
}

export function registerReportsExactFileSizeWithoutReadingItsContentsS(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it.each(['native', 'terse'])('reports exact file size without reading its contents (%s)', (mode) => {
    const file = join(scope.root, 'archive');
    writeFileSync(file, Buffer.alloc(65537));
    const result = scope.run('%s', mode === 'native' ? { NATIVE: '65537\n' } : { REAL: '1' }, file);
    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
      status: 0,
      stderr: '',
      stdout: '65537\n',
    });
  });
}
