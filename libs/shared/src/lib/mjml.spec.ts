import { isFullMjmlDocument } from './mjml';

describe('isFullMjmlDocument', () => {
  it('detects a bare <mjml> document', () => {
    expect(isFullMjmlDocument('<mjml><mj-body></mj-body></mjml>')).toBe(true);
    expect(isFullMjmlDocument('  <mjml>\n<mj-body></mj-body></mjml>')).toBe(true);
    expect(isFullMjmlDocument('<MJML><mj-body></mj-body></MJML>')).toBe(true);
    expect(isFullMjmlDocument('<mjml lang="de"><mj-body></mj-body></mjml>')).toBe(true);
  });

  it('detects a document with an XML declaration before <mjml>', () => {
    expect(isFullMjmlDocument('<?xml version="1.0" encoding="UTF-8"?>\n<mjml><mj-body></mj-body></mjml>')).toBe(true);
    expect(isFullMjmlDocument('<?xml version="1.0"?><mjml><mj-body></mj-body></mjml>')).toBe(true);
  });

  it('detects a document with a DOCTYPE before <mjml>', () => {
    expect(isFullMjmlDocument('<!DOCTYPE mjml PUBLIC "-//Mailjet//DTD MJML 4.0//EN" "">\n<mjml></mjml>')).toBe(true);
  });

  it('detects a document with both XML declaration and DOCTYPE', () => {
    expect(isFullMjmlDocument('<?xml version="1.0"?>\n<!DOCTYPE mjml>\n<mjml></mjml>')).toBe(true);
  });

  it('returns false for mj-body fragments', () => {
    expect(isFullMjmlDocument('<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>')).toBe(false);
    expect(isFullMjmlDocument('')).toBe(false);
  });

  it('returns false for tags that start with mjml but are not <mjml>', () => {
    expect(isFullMjmlDocument('<mjmlx>not a doc</mjmlx>')).toBe(false);
  });
});
