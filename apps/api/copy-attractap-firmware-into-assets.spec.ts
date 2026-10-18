import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { copyFirmwareAssets } = require('./copy-attractap-firmware-into-assets.js');

describe('firmware asset copying', () => {
  let root: string;
  let assets: string;
  let source: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'firmware-copy-test-'));
    assets = path.join(root, 'assets');
    source = path.join(root, 'source');
    fs.mkdirSync(source);
    fs.mkdirSync(assets);
    fs.writeFileSync(path.join(assets, 'stale.bin'), 'old');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = () => copyFirmwareAssets(assets, [{ path: source }]);
  const catalog = (manifest: unknown) =>
    fs.writeFileSync(path.join(source, 'firmwares.json'), JSON.stringify(manifest));

  it('combines catalogs, copies listed images and sidecars, and replaces stale assets', () => {
    fs.mkdirSync(path.join(assets, 'stale-directory'));
    const firmware = {
      filename: 'firmware.bin',
      filenameOTA: 'ota.bin',
      elfFilename: 'symbols.elf',
      securityProfile: 'bridge',
    };
    catalog({ firmwares: [firmware] });
    for (const name of ['firmware.bin', 'ota.bin', 'symbols.elf', 'unlisted.bin', 'ignored.json'])
      fs.writeFileSync(path.join(source, name), name);
    fs.mkdirSync(path.join(source, 'debug'));
    fs.writeFileSync(path.join(source, 'debug/log.txt'), 'debug');
    const second = path.join(root, 'second');
    fs.mkdirSync(second);
    fs.writeFileSync(path.join(second, 'firmwares.json'), JSON.stringify({ firmwares: [{ filename: 'touch.bin' }] }));
    fs.writeFileSync(path.join(second, 'touch.bin'), 'touch');
    copyFirmwareAssets(assets, [{ path: source }, { path: second }]);
    expect(fs.readdirSync(assets).sort()).toEqual([
      'firmware.bin',
      'firmwares.json',
      'ota.bin',
      'symbols.elf',
      'touch.bin',
    ]);
    for (const name of ['firmware.bin', 'ota.bin', 'symbols.elf'])
      expect(fs.readFileSync(path.join(assets, name), 'utf8')).toBe(name);
    expect(JSON.parse(fs.readFileSync(path.join(assets, 'firmwares.json'), 'utf8')).firmwares).toEqual([
      firmware,
      { filename: 'touch.bin' },
    ]);
  });

  it.each(['{', '{}', '{"firmwares":{}}'])('rejects malformed catalog %s and preserves existing assets', (text) => {
    fs.writeFileSync(path.join(source, 'firmwares.json'), text);
    expect(run).toThrow();
    expect(fs.readFileSync(path.join(assets, 'stale.bin'), 'utf8')).toBe('old');
    expect(fs.readdirSync(root).sort()).toEqual(['assets', 'source']);
  });

  it.each([
    {},
    null,
    { filename: 'missing.bin' },
    { filename: '../stale.bin' },
    { filename: 'reader.bin', securityProfile: 'unknown' },
    { filename: 'reader.bin', securityProfile: 'production' },
    { filename: 'reader.bin', elfFilename: 'missing.elf' },
  ])('rejects invalid or unqualified entries and preserves existing assets: %j', (firmware) => {
    fs.writeFileSync(path.join(source, 'reader.bin'), 'bridge');
    catalog({ firmwares: [firmware] });
    expect(run).toThrow();
    expect(fs.readFileSync(path.join(assets, 'stale.bin'), 'utf8')).toBe('old');
    expect(fs.readdirSync(root).sort()).toEqual(['assets', 'source']);
  });

  it('copies no unlisted files when a catalog is absent', () => {
    fs.writeFileSync(path.join(source, 'extra.bin'), 'extra');
    run();
    expect(fs.readdirSync(assets)).toEqual(['firmwares.json']);
    expect(JSON.parse(fs.readFileSync(path.join(assets, 'firmwares.json'), 'utf8'))).toEqual({ firmwares: [] });
  });
});
