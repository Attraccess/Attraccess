import { describe, expect, it } from 'vitest';
import { stripScripts } from './strip-preview-scripts';

describe('MJML preview scripts', () => {
  it.each(['<script>alert(1)</script>', '<SCRIPT>alert(1)</SCRIPT>', '<script>alert(1)</script >'])(
    'removes executable markup: %s',
    (script) => {
      const result = stripScripts(`<mjml><mj-body><mj-raw>${script}</mj-raw></mj-body></mjml>`);
      expect(new DOMParser().parseFromString(result, 'text/html').querySelector('script')).toBeNull();
      expect(result).not.toContain('alert(1)');
    },
  );
  it('keeps a template without scripts exactly as entered', () => {
    const template = '<mjml><mj-body><mj-text font-size="15px">Hello</mj-text></mj-body></mjml>';
    expect(stripScripts(template)).toBe(template);
  });
  it('does not create a script by removing a nested tag from malformed HTML', () => {
    const result = stripScripts(
      '<mjml><mj-body><mj-raw><scr<script></script>ipt>alert(1)</script></mj-raw></mj-body></mjml>',
    );
    expect(new DOMParser().parseFromString(result, 'text/html').querySelector('script')).toBeNull();
  });
  it('removes scripts inside template fragments when malformed MJML falls back to HTML', () => {
    const result = stripScripts(
      '<mjml><template><template><SCRIPT>window.bad = true</sCrIpT></template></template><mj-body></mjml>',
    );
    expect(result.toLowerCase()).not.toContain('<script');
    expect(result).not.toContain('window.bad');
  });
});
