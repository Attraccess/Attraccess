import {
  hasControlCharacter,
  isPublishablePayload,
  isPublishableTopic,
  isValidTopicFilter,
  MAX_FILTER_BYTES,
  MAX_PUBLISH_PAYLOAD_BYTES,
  MAX_TOPIC_BYTES,
  topicMatchesFilter,
  utf8ByteLength,
  validateTopicFilter,
} from './mqtt-explorer';

describe('isValidTopicFilter', () => {
  it('is the same function as validateTopicFilter', () => {
    expect(validateTopicFilter).toBe(isValidTopicFilter);
  });

  it.each(['#', '+', 'a/b', 'a/+/c', 'a/#', '+/#', 'ä/ö', '$SYS/#', 'x'.repeat(MAX_FILTER_BYTES)])(
    'accepts %s',
    (filter) => {
      expect(isValidTopicFilter(filter)).toBe(true);
    },
  );

  it.each([
    '',
    'a#',
    'a/#/b',
    'a+/b',
    '+a',
    'a\0b',
    'a\tb',
    'a\nb',
    'a\u001fb',
    'a\u007fb',
    'a\u0085b',
    'a\u009fb',
    'x'.repeat(MAX_FILTER_BYTES + 1),
    // Multi-byte characters count in bytes.
    'ä'.repeat(MAX_FILTER_BYTES / 2 + 1),
    '$share/group/#',
    '$share/g/a/b',
    '$queue/a/b',
    '$exclusive/a/b',
    42,
    undefined,
  ])('rejects %j', (filter) => {
    expect(isValidTopicFilter(filter)).toBe(false);
  });

  it('accepts the characters right outside the control ranges', () => {
    expect(isValidTopicFilter('a b~\u00a0')).toBe(true);
  });
});

describe('isPublishableTopic', () => {
  it.each(['a', 'a/b', '$SYS/x', 'x'.repeat(MAX_TOPIC_BYTES), 'ä'.repeat(MAX_TOPIC_BYTES / 2)])(
    'accepts %s',
    (topic) => {
      expect(isPublishableTopic(topic)).toBe(true);
    },
  );

  it.each([
    '',
    'a/+',
    'a/#',
    'a\0',
    'a\tb',
    'a\u0001',
    'a\u009f',
    'x'.repeat(MAX_TOPIC_BYTES + 1),
    'ä'.repeat(MAX_TOPIC_BYTES / 2 + 1),
  ])('rejects %j', (topic) => {
    expect(isPublishableTopic(topic)).toBe(false);
  });

  it('rejects a value that is not a string', () => {
    expect(isPublishableTopic(42 as never)).toBe(false);
  });
});

describe('isPublishablePayload', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(isPublishablePayload('')).toBe(true);
    expect(isPublishablePayload('x'.repeat(MAX_PUBLISH_PAYLOAD_BYTES))).toBe(true);
    expect(isPublishablePayload('x'.repeat(MAX_PUBLISH_PAYLOAD_BYTES + 1))).toBe(false);
    expect(isPublishablePayload('ä'.repeat(MAX_PUBLISH_PAYLOAD_BYTES / 2))).toBe(true);
    expect(isPublishablePayload('ä'.repeat(MAX_PUBLISH_PAYLOAD_BYTES / 2 + 1))).toBe(false);
  });
});

describe('helpers', () => {
  it('measures UTF-8 bytes', () => {
    expect(utf8ByteLength('aä€😀')).toBe(1 + 2 + 3 + 4);
  });

  it('finds C0 and C1 control characters and DEL', () => {
    expect(hasControlCharacter('plain/topic')).toBe(false);
    for (const code of [0x00, 0x01, 0x1f, 0x7f, 0x80, 0x9f])
      expect(hasControlCharacter(`a${String.fromCharCode(code)}`)).toBe(true);
    for (const code of [0x20, 0x7e, 0xa0]) expect(hasControlCharacter(String.fromCharCode(code))).toBe(false);
  });
});

describe('topicMatchesFilter', () => {
  it.each([
    ['#', 'a'],
    ['#', 'a/b/c'],
    ['a/#', 'a'],
    ['a/#', 'a/b/c'],
    ['a/+/c', 'a/b/c'],
    ['+/b', 'a/b'],
    ['a/b', 'a/b'],
    ['$SYS/#', '$SYS/broker/uptime'],
  ])('%s matches %s', (filter, topic) => {
    expect(topicMatchesFilter(filter, topic)).toBe(true);
  });

  it.each([
    ['a/b', 'a'],
    ['a', 'a/b'],
    ['a/+', 'a'],
    ['a/+/c', 'a/b/d'],
    ['+/b', 'a/c'],
    ['#', '$SYS/broker/uptime'],
    ['+/broker', '$SYS/broker'],
  ])('%s does not match %s', (filter, topic) => {
    expect(topicMatchesFilter(filter, topic)).toBe(false);
  });
});
