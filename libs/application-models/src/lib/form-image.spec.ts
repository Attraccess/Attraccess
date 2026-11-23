import { DEFAULT_FORM_IMAGES, MAX_FORM_IMAGES, formImageLimit, parseFormImageIds } from './form-image';

describe('formImageLimit', () => {
  it('reads a whole number from 1 to 10', () => {
    expect(formImageLimit({ maxImages: 1 })).toBe(1);
    expect(formImageLimit({ maxImages: 7 })).toBe(7);
    expect(formImageLimit({ maxImages: MAX_FORM_IMAGES })).toBe(MAX_FORM_IMAGES);
  });

  it.each([null, undefined, {}, [], 'x', 3, { maxImages: 0 }, { maxImages: 11 }, { maxImages: 1.5 }, { maxImages: '3' }])(
    'falls back to the default for %p',
    (options) => {
      expect(formImageLimit(options)).toBe(DEFAULT_FORM_IMAGES);
    },
  );
});

describe('parseFormImageIds', () => {
  it('reads a JSON array string and an array of ids', () => {
    expect(parseFormImageIds('["a","b"]')).toEqual(['a', 'b']);
    expect(parseFormImageIds(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('keeps only string ids', () => {
    expect(parseFormImageIds('["a",1,null]')).toEqual(['a']);
    expect(parseFormImageIds(['a', 2])).toEqual(['a']);
  });

  it.each([undefined, null, 5, '', '   ', 'not json', '{"a":1}', '"a"'])('treats %p as no answer', (value) => {
    expect(parseFormImageIds(value)).toEqual([]);
  });
});
