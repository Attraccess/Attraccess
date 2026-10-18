import { generateCardKey } from './card-key-generation';

describe('future card application key generation', () => {
  const context = { installationId: 'installation', cardId: 'card', applicationId: 'application', slot: 0 };

  it('generates independent AES-128 keys, including for the same context', () => {
    const keys = [generateCardKey(context), generateCardKey(context), generateCardKey({ ...context, slot: 1 })];
    expect(keys.every((key) => key.length === 16)).toBe(true);
    expect(new Set(keys.map((key) => key.toString('hex'))).size).toBe(3);
  });

  it.each([
    { installationId: '' },
    { cardId: '' },
    { applicationId: '' },
    { slot: -1 },
    { slot: 256 },
    { slot: 0.5 },
    { slot: NaN },
  ])('rejects incomplete or invalid context %j', (replacement) => {
    expect(() => generateCardKey({ ...context, ...replacement })).toThrow();
  });
});
