import { f, step } from '@attraccess/plugins-backend-sdk';
import { MATTER_STORAGE } from '../plugin-storage/tables';
import { schemaNameOf, storageSchemaName } from './migration-reader';

describe('Matter storage schema identity (backup compatibility)', () => {
  it('keeps the name of the last 1.x migration while later versions only add indexes', () => {
    expect(MATTER_STORAGE.migrations.length).toBeGreaterThan(1);
    // Backups made by 1.x and by earlier 2.x builds carry this name; an index changes no row they hold.
    expect(storageSchemaName()).toBe('CreateMatterBackup1793900002000');
  });

  it('names the last migration that changes rows: a column or a data step', () => {
    const withColumn = {
      ...MATTER_STORAGE,
      migrations: [
        ...MATTER_STORAGE.migrations,
        { version: 3, name: 'note', steps: [step.addColumn('nodes', 'note', f.text().optional())] },
        { version: 4, name: 'index', steps: [step.addIndex('nodes', { fields: ['note'] })] },
      ],
    };
    expect(schemaNameOf(withColumn)).toBe('v3:note');
    const withData = {
      ...MATTER_STORAGE,
      migrations: [...MATTER_STORAGE.migrations, { version: 3, name: 'fill', data: async () => undefined }],
    };
    expect(schemaNameOf(withData)).toBe('v3:fill');
  });
});
