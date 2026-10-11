import { resolveDatabasePath, resolveStorageRoot } from './storage-path';

describe('storage paths shared by runtime, migrations and seeding', () => {
  it('defaults to storage beneath the working directory', () => {
    expect(resolveStorageRoot({}, '/workspace')).toBe('/workspace/storage');
    expect(resolveDatabasePath({}, '/workspace')).toBe('/workspace/storage/attraccess.sqlite');
  });

  it('resolves relative and absolute STORAGE_ROOT consistently', () => {
    expect(resolveDatabasePath({ STORAGE_ROOT: './development/data' }, '/workspace')).toBe(
      '/workspace/development/data/attraccess.sqlite',
    );
    expect(resolveDatabasePath({ STORAGE_ROOT: '/data' }, '/workspace')).toBe('/data/attraccess.sqlite');
  });
});
