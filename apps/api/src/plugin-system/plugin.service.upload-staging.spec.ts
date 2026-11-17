import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import fsPromises from 'fs/promises';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { zipFileUpload } from './__test__/make-zip';

// ATT-1262: a ZIP upload stages in its own dot-prefixed folder and leaves nothing behind.
describe('PluginService.uploadPlugin staging cleanup', () => {
  const fixture = registerPluginServiceFixture();

  const validZip = (name = 'uploaded-plugin') =>
    zipFileUpload({ 'plugin.json': JSON.stringify({ ...fixture.VALID_MANIFEST, name }) });
  const leftovers = () =>
    readdirSync(fixture.root).filter((entry) => entry === 'temp' || entry.startsWith('.zip-upload-'));

  it.each([
    [
      'an invalid manifest',
      () => zipFileUpload({ 'plugin.json': JSON.stringify({ name: 'x' }) }),
      BadRequestException,
      'Invalid plugin.json',
    ],
    [
      'a missing plugin.json',
      () => zipFileUpload({ 'dist/index.js': '' }),
      BadRequestException,
      'Zip file must contain a plugin.json, either at its root or in a single folder',
    ],
    [
      'ambiguous wrapper folders',
      () =>
        zipFileUpload({
          'a/plugin.json': JSON.stringify(fixture.VALID_MANIFEST),
          'b/plugin.json': JSON.stringify(fixture.VALID_MANIFEST),
        }),
      BadRequestException,
      'Zip file must contain a plugin.json, either at its root or in a single folder',
    ],
    [
      'an unextractable file',
      () => zipFileUpload({ 'plugin.json': '{}' }, { buffer: Buffer.from('nope') }),
      BadRequestException,
      'File could not be extracted, it must be a valid zip file',
    ],
    [
      'a zip-slip entry',
      () => zipFileUpload({ 'plugin.json': JSON.stringify(fixture.VALID_MANIFEST), '../../escaped.js': 'pwned' }),
      BadRequestException,
      'File could not be extracted',
    ],
    [
      'a symlink entry',
      () =>
        zipFileUpload({
          'plugin.json': JSON.stringify(fixture.VALID_MANIFEST),
          'dist/index.js': { data: '/etc/passwd', mode: 0o120777 },
        }),
      BadRequestException,
      'File could not be extracted: Unsafe zip entry "dist/index.js": only regular files and folders are allowed',
    ],
    [
      'a reserved name',
      () => validZip('.hidden'),
      BadRequestException,
      'Plugin name must be a visible single path segment',
    ],
  ])('leaves nothing behind when the upload fails with %s', async (_label, makeZip, errorType, message) => {
    const upload = new PluginService().uploadPlugin(makeZip());

    await expect(upload).rejects.toBeInstanceOf(errorType);
    if (message) await expect(upload).rejects.toThrow(message);
    expect(leftovers()).toEqual([]);
  });

  it('creates nothing for a wrong MIME type', async () => {
    const before = readdirSync(fixture.root);

    await expect(
      new PluginService().uploadPlugin(zipFileUpload({ 'plugin.json': '{}' }, { mimetype: 'text/plain' })),
    ).rejects.toThrow(new BadRequestException('File must be a zip file'));
    expect(readdirSync(fixture.root)).toEqual(before);
  });

  it('creates a missing plugin folder before staging', async () => {
    const pluginDir = join(fixture.root, 'not-yet-created');
    PluginService.configure({ PLUGIN_DIR: pluginDir, RESTART_BY_EXIT: true });

    await expect(new PluginService().uploadPlugin(validZip())).resolves.toMatchObject({ name: 'uploaded-plugin' });
    expect(readdirSync(pluginDir)).toEqual(['uploaded-plugin']);
  });

  // mkdtemp creates its folder as 0700; the plugin folder must get the normal umask mode
  // whether plugin.json sits at the ZIP root or in a wrapper folder.
  it.each([
    ['at the ZIP root', { 'plugin.json': JSON.stringify(fixture.VALID_MANIFEST) }],
    ['in a wrapper folder', { 'wrapped/plugin.json': JSON.stringify(fixture.VALID_MANIFEST) }],
  ])('gives the plugin folder the default mode when plugin.json is %s', async (_label, files) => {
    mkdirSync(join(fixture.root, 'reference'));
    const defaultMode = statSync(join(fixture.root, 'reference')).mode & 0o777;

    await new PluginService().uploadPlugin(zipFileUpload(files));

    expect(statSync(join(fixture.root, 'uploaded-plugin')).mode & 0o777).toBe(defaultMode);
  });

  it('removes an empty legacy temp folder', async () => {
    mkdirSync(join(fixture.root, 'temp'));

    const manifest = await new PluginService().uploadPlugin(validZip());

    expect(manifest.name).toBe('uploaded-plugin');
    expect(existsSync(join(fixture.root, 'uploaded-plugin', 'plugin.json'))).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  it('keeps a non-empty temp folder untouched', async () => {
    mkdirSync(join(fixture.root, 'temp'));
    writeFileSync(join(fixture.root, 'temp', 'plugin.json'), 'keep');

    const manifest = await new PluginService().uploadPlugin(validZip());

    expect(manifest.name).toBe('uploaded-plugin');
    expect(readFileSync(join(fixture.root, 'temp', 'plugin.json'), 'utf8')).toBe('keep');
  });

  it('handles concurrent uploads without a shared staging folder', async () => {
    const upload = (name: string) => new PluginService().uploadPlugin(validZip(name));

    await Promise.all([upload('plugin-a'), upload('plugin-b')]);

    expect(existsSync(join(fixture.root, 'plugin-a', 'plugin.json'))).toBe(true);
    expect(existsSync(join(fixture.root, 'plugin-b', 'plugin.json'))).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  describe('when cleanup throws', () => {
    // Spies on the real module: the fixture's afterEach restoreAllMocks undoes them, so no
    // queued rejection can leak into another test.
    let rm: jest.SpyInstance;
    let rmdir: jest.SpyInstance;

    beforeEach(() => {
      rm = jest.spyOn(fsPromises, 'rm').mockRejectedValueOnce(new Error('rm failed'));
      rmdir = jest.spyOn(fsPromises, 'rmdir').mockRejectedValueOnce(new Error('rmdir failed'));
    });

    afterEach(() => {
      // The queued rejections hit the two cleanup calls, not some other rm/rmdir.
      expect(rm.mock.calls[0][0]).toContain('.zip-upload-');
      expect(rmdir.mock.calls[0][0]).toBe(join(fixture.root, 'temp'));
    });

    it('still returns the manifest of a successful upload', async () => {
      await expect(new PluginService().uploadPlugin(validZip())).resolves.toMatchObject({ name: 'uploaded-plugin' });
    });

    it('still throws the original error of a failed upload', async () => {
      await expect(
        new PluginService().uploadPlugin(zipFileUpload({ 'plugin.json': JSON.stringify({ name: 'x' }) })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
