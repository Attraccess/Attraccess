import { chmodSync, closeSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  FrontendAssetResolution,
  isMissingFrontendAsset,
  openFrontendAsset,
  sanitizedPathPrefix,
} from './frontend-asset-path';

describe('openFrontendAsset', () => {
  let base: string;
  let pluginPath: string;
  const opened: number[] = [];

  function open(segments: string[], frontendDirectory = join('guarded', 'frontend'), pluginDirectory = 'guarded') {
    const result = openFrontendAsset(pluginPath, pluginDirectory, frontendDirectory, segments);
    if ('fd' in result) opened.push(result.fd);
    return result;
  }

  function contentOf(result: FrontendAssetResolution): string {
    if (!('fd' in result)) throw new Error(`refused: ${result.reason}`);
    return readFileSync(result.fd, 'utf8');
  }

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'frontend-asset-path-'));
    pluginPath = join(base, 'plugins');
    mkdirSync(join(pluginPath, 'guarded', 'frontend', 'assets'), { recursive: true });
    writeFileSync(join(pluginPath, 'guarded', 'frontend', 'assets', 'chunk.js'), 'chunk');
    writeFileSync(join(pluginPath, 'guarded', 'plugin.json'), 'manifest');
    // siblings that share a prefix with the directories they must not be confused with
    mkdirSync(join(pluginPath, 'guarded', 'frontend-evil'), { recursive: true });
    writeFileSync(join(pluginPath, 'guarded', 'frontend-evil', 'secret.js'), 'secret');
    mkdirSync(join(pluginPath, 'guarded-evil'), { recursive: true });
    writeFileSync(join(pluginPath, 'guarded-evil', 'secret.js'), 'secret');
    mkdirSync(join(base, 'plugins-evil'), { recursive: true });
    writeFileSync(join(base, 'plugins-evil', 'secret.js'), 'secret');
  });

  afterEach(() => {
    opened.splice(0).forEach((fd) => closeSync(fd));
    rmSync(base, { recursive: true, force: true });
  });

  it('opens a nested file inside the frontend directory', () => {
    expect(contentOf(open(['assets', 'chunk.js']))).toBe('chunk');
  });

  it('opens a file when the plugin path itself is reached through a symlink', () => {
    const alias = join(base, 'plugins-alias');
    symlinkSync(pluginPath, alias);
    pluginPath = alias;

    expect(contentOf(open(['assets', 'chunk.js']))).toBe('chunk');
  });

  it('allows the frontend directory to be the plugin directory itself', () => {
    expect(contentOf(open(['plugin.json'], 'guarded'))).toBe('manifest');
  });

  it.each([
    ['empty path', []],
    ['empty segment', ['assets', '', 'chunk.js']],
    ['dot segment', ['.']],
    ['dot segment', ['..', 'plugin.json']],
    ['separator in segment', ['../plugin.json']],
    ['separator in segment', ['..\\plugin.json']],
    ['separator in segment', ['/etc/passwd']],
    ['separator in segment', ['\\\\server\\share']],
    ['nul byte', ['assets', 'chunk.js\0.css']],
    ['drive letter', ['C:', 'Windows', 'win.ini']],
    ['file missing', ['missing.js']],
    ['not a regular file', ['assets']],
  ])('refuses with reason %s: %j', (reason, segments) => {
    expect(open(segments)).toEqual({ reason });
  });

  it.each([
    ['the plugin path itself', '.'],
    ['another plugin', 'guarded-evil'],
    ['a sibling of the plugin path', join('..', 'plugins-evil')],
    ['a parent of the plugin path', join('guarded', '..', '..')],
  ])('refuses a frontend directory pointing at %s', (_label, frontendDirectory) => {
    expect(open(['secret.js'], frontendDirectory)).toEqual({ reason: 'frontend directory outside plugin directory' });
  });

  it('refuses a plugin directory that is a symlink out of the plugin path', () => {
    symlinkSync(join(base, 'plugins-evil'), join(pluginPath, 'linked'));

    expect(open(['secret.js'], 'linked', 'linked')).toEqual({ reason: 'frontend directory outside plugin directory' });
  });

  // root ignores file modes, so the open could not fail there
  (process.getuid?.() === 0 ? it.skip : it)('reports a file it cannot open as missing', () => {
    const unreadable = join(pluginPath, 'guarded', 'frontend', 'unreadable.js');
    writeFileSync(unreadable, 'chunk');
    chmodSync(unreadable, 0o000);

    expect(open(['unreadable.js'])).toEqual({ reason: 'file missing' });
  });

  it('reports a missing frontend directory', () => {
    expect(open(['chunk.js'], join('guarded', 'dist'))).toEqual({ reason: 'frontend directory missing' });
  });

  it.each([
    ['outside the plugin path', () => join(base, 'plugins-evil', 'secret.js')],
    [
      'into a sibling sharing the frontend directory as a prefix',
      () => join(pluginPath, 'guarded', 'frontend-evil', 'secret.js'),
    ],
  ])('refuses a symlink %s', (_label, target) => {
    symlinkSync(target(), join(pluginPath, 'guarded', 'frontend', 'escape.js'));

    expect(open(['escape.js'])).toEqual({ reason: 'resolved outside frontend directory' });
  });

  it('only treats a missing file as an ordinary miss', () => {
    expect(isMissingFrontendAsset('file missing')).toBe(true);
    expect(isMissingFrontendAsset('frontend directory missing')).toBe(false);
    expect(isMissingFrontendAsset('dot segment')).toBe(false);
    expect(isMissingFrontendAsset('resolved outside frontend directory')).toBe(false);
  });
});

describe('sanitizedPathPrefix', () => {
  it('strips control, line separator and bidi characters and truncates', () => {
    const prefix = sanitizedPathPrefix(['\u001b[31m\u009b\u0085\u2028\u202e\u2066abc' + 'x'.repeat(100)]);

    expect(prefix).toBe(JSON.stringify('[31mabc' + 'x'.repeat(25)));
  });
});
