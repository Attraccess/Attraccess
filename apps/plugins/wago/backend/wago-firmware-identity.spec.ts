import { spawnSync } from 'node:child_process';
import { wagoFw31IdentityCheck, isCc100Fw31Identity } from './wago-firmware-identity';

const shellIdentity = (input: string) =>
  spawnSync('/bin/sh', ['-c', wagoFw31IdentityCheck().replace(' "/etc/os-release"', '')], { input, encoding: 'utf8' });

describe('CC100 FW31 identity, never a BSP-only or operator-supplied qualification', () => {
  it.each([
    ['VERSION_ID="31"', true],
    ['VERSION_ID="4.9.1(31)"', true],
    ['VERSION_ID="04.09.01(31)"', true],
    ['VERSION_ID="2024.12.0"\nVERSION="4.9.1(31)"', true],
    ['VERSION_ID=31', true],
    ['VERSION_ID="2024.12.0"', false],
    ['VERSION_ID="30"', false],
    ['VERSION_ID="32"\nVERSION="31"', false],
    ['VERSION_ID="31"\nVERSION="30"', false],
    ['VERSION_ID="31"\nVERSION_ID="31"', false],
    ['VERSION_ID="31"\nVERSION_ID', false],
    ['VERSION_ID="31"\nPTXDIST_PLATFORM_NAME="other"', false],
    ['VERSION_ID="31"\r', false],
    ['VERSION_ID="31" # guessed release', false],
    ['VERSION_ID="$(printf 31)"', false],
    ['', false],
  ])('host and executable shell agree for %s', (versions, supported) => {
    const input = `PTXDIST_PLATFORM_NAME="cc100"\n${versions}\n`;
    expect(isCc100Fw31Identity(input)).toBe(supported);
    const result = shellIdentity(input);
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(supported ? 0 : 1);
  });

  it('requires the platform field, not a matching substring in a description', () => {
    const input = 'NAME="PTXDIST_PLATFORM_NAME="cc100""\nVERSION_ID="31"\n';
    expect(isCc100Fw31Identity(input)).toBe(false);
    expect(shellIdentity(input).status).toBe(1);
  });

  it.each([0, 1, 9, 11, 13, 31, 127, 128, 255])('rejects control/non-ASCII byte %s even in comments', (byte) => {
    for (const input of [
      `PTXDIST_PLATFORM_NAME=cc100\nVERSION_ID=31${String.fromCharCode(byte)}\n`,
      `PTXDIST_PLATFORM_NAME=cc100\nVERSION_ID=31\n# ${String.fromCharCode(byte)}\n`,
    ]) {
      expect(isCc100Fw31Identity(input)).toBe(false);
      expect(shellIdentity(input).status).toBe(1);
    }
  });

  it.each([16384, 16385, 17000])('enforces the identical total byte bound at %s', (bytes) => {
    const prefix = 'PTXDIST_PLATFORM_NAME=cc100\nVERSION_ID=31\n#';
    const input = prefix + 'x'.repeat(bytes - Buffer.byteLength(prefix));
    expect(isCc100Fw31Identity(input)).toBe(bytes <= 16384);
    expect(shellIdentity(input).status).toBe(bytes <= 16384 ? 0 : 1);
  });

  it('does not accept a partial od read even after valid identity bytes', () => {
    const script = wagoFw31IdentityCheck().replace(
      'LC_ALL=C od -An -v -tu1 "/etc/os-release"',
      `printf '80 84 88 68 73 83 84 95 80 76 65 84 70 79 82 77 95 78 65 77 69 61 99 99 49 48 48 10 86 69 82 83 73 79 78 95 73 68 61 51 49 10\\n'; false`,
    );
    expect(spawnSync('/bin/sh', ['-c', script]).status).toBe(1);
  });
});
