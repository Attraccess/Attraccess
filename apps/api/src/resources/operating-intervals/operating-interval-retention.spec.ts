// Retention guarantee for the authoritative operating timeline (ATT-1024):
// interval rows are retained indefinitely. This spec scans the API source tree so a future
// cleanup/retention/purge job cannot start deleting from `resource_operating_interval`
// without a deliberate, reviewed change here.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const API_SRC = join(__dirname, '..', '..');

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, files);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('operating interval retention (ATT-1024)', () => {
  const sources = collectSourceFiles(API_SRC)
    // The migration that creates the table owns its DROP in down(); that is schema rollback, not cleanup.
    .filter((file) => !file.includes(`${join('database', 'migrations')}`));

  it('no non-migration source deletes or truncates resource_operating_interval rows', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const content = readFileSync(file, 'utf-8');
      if (!content.includes('resource_operating_interval') && !content.includes('ResourceOperatingInterval')) {
        continue;
      }
      const patterns = [
        /DELETE\s+FROM\s+"?resource_operating_interval/i,
        /TRUNCATE[\s\S]{0,80}resource_operating_interval/i,
        /intervalRepository\s*\.\s*(delete|remove|createQueryBuilder[\s\S]{0,200}delete)/,
        /getRepository\(\s*ResourceOperatingInterval\s*\)[\s\S]{0,200}\.(delete|remove)\(/,
      ];
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the interval service documents the retention guarantee where rows are managed', () => {
    const service = readFileSync(join(__dirname, 'resource-operating-interval.service.ts'), 'utf-8');
    expect(service).toContain('RETENTION GUARANTEE');
  });
});
