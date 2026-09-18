import { ManagementPeerVersion } from './wago-management-peer-version';

const known = 'debug1: Remote protocol version 2.0, remote software version dropbear_2025.88\r\n';
describe('version of the same pinned SSH peer', () => {
  it('accepts an exact version across arbitrary transport chunks without retaining other diagnostics', () => {
    const parser = new ManagementPeerVersion();
    for (const byte of Buffer.from('unrelated diagnostic\n' + known)) parser.write(Buffer.from([byte]));
    expect(parser.result()).toBe('2025.88');
    expect(JSON.stringify(parser)).not.toContain('diagnostic');
  });
  it.each([
    '',
    known + known,
    known.replace('2025.88', '2026.1'),
    known + known.replace('2025.88', 'unknown'),
    known.replace('2025.88', '2025.88-custom'),
    known.trimEnd(),
    known + known.trimEnd(),
    known.replace('2025.88', '2025.88' + 'x'.repeat(512)),
  ])('rejects absent, duplicate, conflicting or unrecognized evidence %#', (trace) => {
    const parser = new ManagementPeerVersion();
    parser.write(Buffer.from(trace));
    expect(parser.result()).toBe('unknown');
  });
});
