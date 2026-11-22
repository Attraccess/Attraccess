import seed from '../../trust/dcl-seed.json';

describe('the bundled DCL seed', () => {
  it('holds production PAA roots and CD signers only, with the date it was built', () => {
    expect(Number.isNaN(Date.parse(seed.builtAt))).toBe(false);
    expect(seed.paaRoots.length).toBeGreaterThan(50);
    expect(seed.cdSigners.length).toBeGreaterThan(0);
    for (const entry of [...seed.paaRoots, ...seed.cdSigners]) {
      expect(entry.kind).toBe('production');
      expect(entry.derHex).toMatch(/^([0-9a-f]{2})+$/);
      expect(entry.subjectKeyId).toMatch(/^[0-9A-F]{40}$/);
    }
  });
});
