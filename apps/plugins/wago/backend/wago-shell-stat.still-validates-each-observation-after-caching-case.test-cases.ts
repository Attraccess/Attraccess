import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { wagoShellStat } from './wago-shell-stat';
import type { Fw31SourceBackedStatMetadataAdapterTestScope } from './wago-shell-stat.spec';
export function registerStillValidatesEachObservationAfterCachingCase(
  scope: Fw31SourceBackedStatMetadataAdapterTestScope,
): void {
  it.each([
    { STATUS: '1' },
    { FIELDS: scope.fields.replace('7779', '18446744073709551616'), NATIVE: '0:0:888:1\n' },
    { SUFFIX: '', NATIVE: '0:0:700:1' },
    { NULL_BYTE: '1', NATIVE_NULL: '1' },
    { SUFFIX: '\n\nWAGO_STAT_OK', NATIVE: '0:0:700:1\n\nWAGO_STAT_OK', STATUS: '1' },
    { SUFFIX: '\n\nWAGO_STAT_OK' + '\n'.repeat(9000), NATIVE: '0:0:700:1\n\nWAGO_STAT_OK' + '\n'.repeat(9000) },
  ])('still validates each observation after caching: case %#', (fault) => {
    for (const mode of ['native', 'terse']) {
      const calls = join(scope.root, 'calls-' + mode);
      const assignments = Object.entries(fault)
        .filter(([key]) => mode === 'native' || !key.startsWith('NATIVE'))
        .map(([key, value]) => `export ${key}=${scope.quote(value)}`)
        .join('\n');
      const result = scope.runScript(`${wagoShellStat()}\n${assignments}\nstat -c '%u:%g:%a:%h' /etc`, {
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
}
