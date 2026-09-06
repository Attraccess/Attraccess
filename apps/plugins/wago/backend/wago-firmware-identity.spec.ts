import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fw31IdentityOutput, fw31Model, fw31OsRelease, fw31Revisions } from './fixtures/fw31-identity';
import { wagoFw31IdentityCheck, wagoFw31IdentityRead, isCc100Fw31Identity } from './wago-firmware-identity';

const shellIdentity = (input: string) =>
  spawnSync('/bin/sh', ['-c', wagoFw31IdentityCheck().replace(wagoFw31IdentityRead(), 'cat')], {
    input,
    encoding: 'utf8',
  });
const agree = (input: string, supported: boolean) => {
  expect(isCc100Fw31Identity(input)).toBe(supported);
  const result = shellIdentity(input);
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(supported ? 0 : 1);
};

describe('source-backed CC100 FW31 identity, not live qualification', () => {
  it('matches the owner capture model hash including the terminal NUL', () => {
    expect(createHash('sha256').update(fw31Model).digest('hex')).toBe(
      '728889ca9b67dac65330484dfa962d63dbdb709897d69f17bc6e0243497d80fa',
    );
  });
  it('accepts the real capture in host and POSIX shell', () => agree(fw31IdentityOutput(), true));
  it.each(['31', '4.9.1(31)', '04.09.01(30)', '04.09.01(32)', '$(printf 04.09.01(31))', ''])(
    'rejects unproven or wrong firmware %s',
    (version) => agree(fw31IdentityOutput(fw31OsRelease, `FIRMWARE=${version}\n`), false),
  );
  it.each([
    '',
    'FIRMWARE',
    fw31Revisions + fw31Revisions,
    fw31Revisions + 'FIRMWARE=04.09.01(30)\n',
    'FIRMWARE="04.09.01(31)\n',
    'FIRMWARE=04.09.01(31) # guessed\n',
    fw31Revisions + 'VERSION=31\n',
    fw31Revisions + 'malformed\n',
  ])('rejects absent, malformed, duplicate or misplaced revision metadata %s', (revisions) =>
    agree(fw31IdentityOutput(fw31OsRelease, revisions), false),
  );
  it.each([
    '',
    'CC100',
    '751-9301',
    'CC100-751-9302\0',
    'CC100-751-9301\n',
    'CC100-751-9301',
    fw31Model + '\0',
    fw31Model + 'other',
  ])('requires exact model %s', (model) => agree(fw31IdentityOutput(fw31OsRelease, fw31Revisions, model), false));
  it.each([
    '',
    fw31OsRelease + 'VERSION=2024.12.0\n',
    fw31OsRelease + 'FIRMWARE=04.09.01(31)\n',
    fw31OsRelease.replace('cc100', 'other'),
    fw31OsRelease.replace('VERSION="2024.12.0"', 'VERSION="31"'),
    fw31OsRelease + 'BROKEN\n',
    fw31OsRelease + 'NAME=duplicate\n',
  ])('rejects absent or conflicting os-release metadata %s', (osRelease) =>
    agree(fw31IdentityOutput(osRelease), false),
  );
  it('supports quoted assignment syntax, not release aliases', () =>
    agree(fw31IdentityOutput(fw31OsRelease, 'FIRMWARE="04.09.01(31)"'), true));
  it.each([0, 1, 9, 11, 13, 31, 127, 128, 255])('rejects control/non-ASCII byte %s', (byte) => {
    agree(fw31IdentityOutput(fw31OsRelease + '# ' + String.fromCharCode(byte)), false);
    agree(fw31IdentityOutput(fw31OsRelease, fw31Revisions + '# ' + String.fromCharCode(byte)), false);
  });
  it.each([8192, 8193, 17000])('bounds total source bytes at %s', (bytes) => {
    const prefix = fw31OsRelease + '#';
    const osRelease = prefix + 'x'.repeat(bytes - Buffer.byteLength(prefix + fw31Revisions + fw31Model));
    agree(fw31IdentityOutput(osRelease), bytes <= 8192);
  });
  it.each([
    (s: string) => s.replace('complete\n', ''),
    (s: string) => s + 'complete\n',
    (s: string) => s.replace('source1', 'source0'),
    (s: string) => s.replace('source1', 'source3'),
    (s: string) => s.replace('source0\n', 'source0\n' + ' '.repeat(50001) + '\n'),
  ])('rejects incomplete or corrupt framing', (change) => agree(change(fw31IdentityOutput()), false));
  it('executes bounded reads against isolated files and fails on a missing source', () => {
    const root = mkdtempSync(join(process.cwd(), '.wago-identity-'));
    try {
      mkdirSync(join(root, 'etc'));
      mkdirSync(join(root, 'sys/firmware/devicetree/base'), { recursive: true });
      writeFileSync(join(root, 'etc/os-release'), fw31OsRelease);
      writeFileSync(join(root, 'etc/REVISIONS'), fw31Revisions);
      writeFileSync(join(root, 'sys/firmware/devicetree/base/model'), fw31Model);
      const run = (script: string) =>
        spawnSync('/bin/sh', ['-c', script], { env: { ...process.env, root }, encoding: 'utf8' });
      const read = run(wagoFw31IdentityRead(true));
      expect(read.status).toBe(0);
      agree(read.stdout, true);
      expect(run(wagoFw31IdentityCheck(true)).status).toBe(0);
      const padding = 8192 - Buffer.byteLength(fw31OsRelease + '#' + fw31Revisions + fw31Model);
      writeFileSync(join(root, 'etc/os-release'), fw31OsRelease + '#' + 'x'.repeat(padding));
      const boundary = run(wagoFw31IdentityRead(true));
      expect(Buffer.byteLength(boundary.stdout)).toBeLessThan(50000);
      agree(boundary.stdout, true);
      expect(run(wagoFw31IdentityCheck(true)).status).toBe(0);
      writeFileSync(join(root, 'etc/os-release'), fw31OsRelease + '#' + 'x'.repeat(20000));
      expect(run(wagoFw31IdentityCheck(true)).status).toBe(1);
      rmSync(join(root, 'etc/REVISIONS'));
      expect(isCc100Fw31Identity(run(wagoFw31IdentityRead(true)).stdout)).toBe(false);
      expect(run(wagoFw31IdentityCheck(true)).status).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
