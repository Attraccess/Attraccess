import { topicMatches, heartbeatKey } from './flow.utils';

describe('flow.utils', () => {
  describe('topicMatches', () => {
    it('matches an exact single-segment topic', () => {
      expect(topicMatches('foo', 'foo')).toBe(true);
    });

    it('matches an exact multi-segment topic', () => {
      expect(topicMatches('a/b/c', 'a/b/c')).toBe(true);
    });

    it('does not match a different exact topic', () => {
      expect(topicMatches('a/b/c', 'a/b/d')).toBe(false);
    });

    it('does not match when segment counts differ (no wildcard)', () => {
      expect(topicMatches('a/b', 'a/b/c')).toBe(false);
      expect(topicMatches('a/b/c', 'a/b')).toBe(false);
    });

    it('matches a single-level "+" wildcard', () => {
      expect(topicMatches('a/+/c', 'a/anything/c')).toBe(true);
    });

    it('"+" wildcard matches exactly one level, not multiple', () => {
      expect(topicMatches('a/+/c', 'a/x/y/c')).toBe(false);
    });

    it('"+" wildcard requires the level to be non-empty', () => {
      expect(topicMatches('a/+/c', 'a//c')).toBe(false);
    });

    it('matches multiple "+" wildcards', () => {
      expect(topicMatches('+/+', 'foo/bar')).toBe(true);
    });

    it('matches a trailing "#" wildcard against many levels', () => {
      expect(topicMatches('a/#', 'a/b/c/d')).toBe(true);
    });

    it('matches a trailing "#" wildcard against zero remaining levels', () => {
      // '#' -> '.*' so the trailing '/' separator may still need to match; here
      // 'a/' + '.*' matches 'a/' with empty tail.
      expect(topicMatches('a/#', 'a/')).toBe(true);
    });

    it('matches a standalone "#" wildcard against anything', () => {
      expect(topicMatches('#', 'a/b/c')).toBe(true);
      expect(topicMatches('#', '')).toBe(true);
    });

    it('treats "#" as a literal when it is NOT the trailing segment', () => {
      // Non-trailing '#' is regex-escaped to a literal '#', so it only matches a literal '#'.
      expect(topicMatches('#/b', 'a/b')).toBe(false);
      expect(topicMatches('#/b', '#/b')).toBe(true);
    });

    it('does not match a "#" filter when the literal prefix differs', () => {
      expect(topicMatches('a/#', 'b/c')).toBe(false);
    });

    it('regex-escapes special characters in literal segments', () => {
      // Without escaping, '.' would match any char. With escaping it is literal.
      expect(topicMatches('a.b', 'a.b')).toBe(true);
      expect(topicMatches('a.b', 'aXb')).toBe(false);
    });

    it('regex-escapes other regex metacharacters literally', () => {
      const filter = 'a+b(c)$';
      expect(topicMatches(filter, 'a+b(c)$')).toBe(true);
      expect(topicMatches(filter, 'aab(c)$')).toBe(false);
    });

    it('anchors the match (no partial matches)', () => {
      expect(topicMatches('foo', 'xfooy')).toBe(false);
      expect(topicMatches('a/b', 'za/bz')).toBe(false);
    });

    it('combines "+" and trailing "#" wildcards', () => {
      expect(topicMatches('a/+/#', 'a/x/y/z')).toBe(true);
      expect(topicMatches('a/+/#', 'a/x/')).toBe(true);
      expect(topicMatches('a/+/#', 'b/x/y')).toBe(false);
    });
  });

  describe('heartbeatKey', () => {
    it('joins resourceId and identifier with a "::" separator', () => {
      expect(heartbeatKey(1, 'abc')).toBe('1::abc');
    });

    it('coerces the numeric resourceId into the string', () => {
      expect(heartbeatKey(42, 'reader-01')).toBe('42::reader-01');
    });

    it('handles an empty identifier', () => {
      expect(heartbeatKey(7, '')).toBe('7::');
    });
  });
});
