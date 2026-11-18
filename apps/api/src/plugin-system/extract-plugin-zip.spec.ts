import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Entry } from 'yauzl';
import { extractPluginZip, safeTargetPath, UnsafeZipEntryError } from './extract-plugin-zip';
import { makeZip } from './__test__/make-zip';

describe('extractPluginZip', () => {
  let root: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'extract-plugin-zip-'));
    target = join(root, 'staging', 'contents');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('extracts files and folders and counts the entries', async () => {
    const zip = makeZip({
      'plugin.json': '{}',
      'dist/': '',
      'dist/index.js': 'module.exports = {};',
      'bin/run': { data: '#!/bin/sh', mode: 0o100755 },
    });

    await expect(extractPluginZip(zip, target)).resolves.toBe(4);
    expect(readFileSync(join(target, 'dist', 'index.js'), 'utf8')).toBe('module.exports = {};');
    expect(statSync(join(target, 'bin', 'run')).mode & 0o111).not.toBe(0);
  });

  it('returns 0 for an archive without entries', async () => {
    await expect(extractPluginZip(makeZip({}), target)).resolves.toBe(0);
  });

  it('rejects a buffer that is not a zip', async () => {
    await expect(extractPluginZip(Buffer.from('not a zip'), target)).rejects.toThrow();
  });

  it.each([
    ['a parent-folder (zip-slip) path', '../../escaped.txt'],
    ['a nested zip-slip path', 'dist/../../../escaped.txt'],
    ['an absolute path', '/tmp/escaped.txt'],
    ['a Windows drive path', 'C:/escaped.txt'],
    ['a backslash path', '..\\..\\escaped.txt'],
  ])('rejects %s and writes nothing outside the target folder', async (_label, name) => {
    const zip = makeZip({ 'plugin.json': '{}', [name]: 'pwned' });

    await expect(extractPluginZip(zip, target)).rejects.toThrow(
      new UnsafeZipEntryError(name, 'path leaves the target folder'),
    );
    expect(existsSync(join(root, 'escaped.txt'))).toBe(false);
    expect(readdirSync(root)).toEqual(expect.not.arrayContaining(['escaped.txt']));
  });

  it.each([
    ['a symlink', 0o120777],
    ['a FIFO', 0o010644],
    ['a block device', 0o060644],
  ])('rejects %s entry without creating it', async (_label, mode) => {
    const zip = makeZip({ 'plugin.json': '{}', link: { data: '/etc/passwd', mode } });

    await expect(extractPluginZip(zip, target)).rejects.toThrow('only regular files and folders are allowed');
    expect(() => lstatSync(join(target, 'link'))).toThrow();
  });

  it('rejects an archive that repeats an entry instead of overwriting it', async () => {
    const zip = makeZip({ 'plugin.json': '{}', './plugin.json': 'replaced' });

    await expect(extractPluginZip(zip, target)).rejects.toThrow(
      new UnsafeZipEntryError('./plugin.json', 'the archive contains this path more than once'),
    );
    expect(readFileSync(join(target, 'plugin.json'), 'utf8')).toBe('{}');
  });

  it('rejects a file entry where an earlier entry made a folder', async () => {
    const zip = makeZip({ 'dist/': '', 'dist/index.js': '', dist: 'not a folder' });

    await expect(extractPluginZip(zip, target)).rejects.toThrow(
      new UnsafeZipEntryError('dist', 'the archive contains this path more than once'),
    );
  });
});

/** yauzl rejects most of these names itself; these cases prove the extractor's own checks hold without it. */
describe('safeTargetPath', () => {
  const root = join(tmpdir(), 'safe-target-path');
  const entry = (fileName: string, { mode = 0, encrypted = false } = {}) =>
    ({ fileName, externalFileAttributes: mode << 16, isEncrypted: () => encrypted }) as unknown as Entry;

  it.each([
    ['a parent-folder path', '../escaped.txt'],
    ['a nested parent-folder path', 'dist/../../escaped.txt'],
    ['an absolute path', '/etc/passwd'],
    ['a Windows drive path', 'C:/escaped.txt'],
    ['a backslash path', 'dist\\..\\..\\escaped.txt'],
    ['a file named after the target folder itself', '.'],
  ])('rejects %s', (_label, name) => {
    expect(() => safeTargetPath(root, entry(name))).toThrow(
      new UnsafeZipEntryError(name, 'path leaves the target folder'),
    );
  });

  it('rejects an encrypted entry', () => {
    expect(() => safeTargetPath(root, entry('plugin.json', { encrypted: true }))).toThrow(
      new UnsafeZipEntryError('plugin.json', 'encrypted entries are not supported'),
    );
  });

  it('rejects a symlink entry', () => {
    expect(() => safeTargetPath(root, entry('link', { mode: 0o120777 }))).toThrow(
      'only regular files and folders are allowed',
    );
  });

  it('resolves plain files and folders under the root', () => {
    expect(safeTargetPath(root, entry('dist/index.js', { mode: 0o100644 }))).toBe(join(root, 'dist', 'index.js'));
    expect(safeTargetPath(root, entry('./', { mode: 0o040755 }))).toBe(root);
  });
});
