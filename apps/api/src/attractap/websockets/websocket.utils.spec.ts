import { securelyHashToken, verifyToken } from './websocket.utils';

jest.setTimeout(30000);

describe('websocket.utils', () => {
  describe('securelyHashToken', () => {
    it('returns a bcrypt hash string', async () => {
      const hash = await securelyHashToken('test-token');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe('test-token');
      expect(hash.startsWith('$2b$')).toBe(true);
    });

    it('produces different hashes for the same input (unique salt)', async () => {
      const hash1 = await securelyHashToken('same-token');
      const hash2 = await securelyHashToken('same-token');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyToken', () => {
    it('returns true for a valid token/hash pair', async () => {
      const token = 'my-secret-token';
      const hash = await securelyHashToken(token);
      const result = await verifyToken(token, hash);
      expect(result).toBe(true);
    });

    it('returns false for a wrong token', async () => {
      const hash = await securelyHashToken('correct-token');
      const result = await verifyToken('wrong-token', hash);
      expect(result).toBe(false);
    });

    it('returns false when token is empty', async () => {
      const hash = await securelyHashToken('some-token');
      const result = await verifyToken('', hash);
      expect(result).toBe(false);
    });

    it('returns false when hash is empty', async () => {
      const result = await verifyToken('some-token', '');
      expect(result).toBe(false);
    });

    it('returns false when both are empty', async () => {
      const result = await verifyToken('', '');
      expect(result).toBe(false);
    });

    it('returns false when token is null/undefined', async () => {
      const result = await verifyToken(null as unknown as string, 'some-hash');
      expect(result).toBe(false);
    });

    it('returns false when hash is null/undefined', async () => {
      const result = await verifyToken('some-token', null as unknown as string);
      expect(result).toBe(false);
    });
  });
});
