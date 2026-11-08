import { MAX_FILTER_BYTES, topicMatchesFilter, validateTopicFilter } from './mqtt-explorer.constants';

describe('validateTopicFilter', () => {
  it.each(['#', '+', 'a/b', 'a/+/c', 'a/#', '$SYS/#', 'x'.repeat(MAX_FILTER_BYTES)])('accepts %s', (filter) => {
    expect(validateTopicFilter(filter)).toBe(true);
  });

  it.each([
    '',
    'a#',
    'a/#/b',
    'a+/b',
    'a\0b',
    'x'.repeat(MAX_FILTER_BYTES + 1),
    // Multi-byte characters count in bytes.
    'ä'.repeat(MAX_FILTER_BYTES / 2 + 1),
    '$share/group/#',
    '$share/g/a/b',
    '$queue/a/b',
    42,
    undefined,
  ])('rejects %j', (filter) => {
    expect(validateTopicFilter(filter)).toBe(false);
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
