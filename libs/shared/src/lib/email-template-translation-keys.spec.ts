import { extractTranslationKeys } from './email-template-translation-keys';

describe('extractTranslationKeys', () => {
  it('extracts key and default from single-quoted helper', () => {
    expect(extractTranslationKeys(`{{t 'greeting' 'Hello {name},' name=user.username}}`)).toEqual([
      { key: 'greeting', defaultValue: 'Hello {name},' },
    ]);
  });

  it('extracts key and default from double-quoted helper', () => {
    expect(extractTranslationKeys(`{{t "body" "Some default text"}}`)).toEqual([
      { key: 'body', defaultValue: 'Some default text' },
    ]);
  });

  it('deduplicates repeated keys', () => {
    const content = `{{t 'greeting' 'Hello'}} {{t 'greeting' 'Hello'}}`;
    expect(extractTranslationKeys(content)).toEqual([{ key: 'greeting', defaultValue: 'Hello' }]);
  });

  it('returns empty array for content with no t helpers', () => {
    expect(extractTranslationKeys('<mj-text>{{resource.name}}</mj-text>')).toEqual([]);
  });

  it('handles escaped \\{{t}} without crashing (literal text, not a helper)', () => {
    expect(extractTranslationKeys('No \\{{t}} helper calls found.')).toEqual([]);
  });

  it('extracts multiple keys in order', () => {
    const content = `{{t 'a' 'First'}} {{t 'b' 'Second'}} {{t 'c' 'Third'}}`;
    expect(extractTranslationKeys(content)).toEqual([
      { key: 'a', defaultValue: 'First' },
      { key: 'b', defaultValue: 'Second' },
      { key: 'c', defaultValue: 'Third' },
    ]);
  });

  it('allows empty default value', () => {
    expect(extractTranslationKeys(`{{t 'key' ''}}`)).toEqual([{ key: 'key', defaultValue: '' }]);
  });
});
