import { describe, expect, it } from 'vitest';
import {
  CHROME_CLASS,
  CONTENT_PLACEHOLDER,
  decodeHtmlOnlyEntities,
  extractTemplateFragment,
  isWellFormedXml,
  splitHead,
  unwrapFragment,
  withCidEmailLogo,
  withPreviewEmailLogo,
  wrapFragment,
  wrapInLayoutChrome,
} from './mjmlLayout';

describe('decodeHtmlOnlyEntities', () => {
  it('decodes HTML-only named entities to plain characters', () => {
    expect(decodeHtmlOnlyEntities('a&nbsp;b')).toBe('a b');
    expect(decodeHtmlOnlyEntities('&mdash;')).toBe('—');
  });

  it('keeps the five XML-safe entities and numeric references verbatim', () => {
    const input = '&amp; &lt; &gt; &quot; &apos; &#123; &#x1F600;';
    expect(decodeHtmlOnlyEntities(input)).toBe(input);
  });

  it('escapes bare ampersands so ordinary copy stays well-formed XML', () => {
    expect(decodeHtmlOnlyEntities('Terms & Conditions')).toBe('Terms &amp; Conditions');
    expect(decodeHtmlOnlyEntities('R&D at AT&T')).toBe('R&amp;D at AT&amp;T');
    expect(isWellFormedXml(`<mjml><mj-body>${decodeHtmlOnlyEntities('Terms & Conditions')}</mj-body></mjml>`)).toBe(
      true,
    );
  });

  it('escapes entity-shaped text it cannot decode instead of mutating it', () => {
    expect(decodeHtmlOnlyEntities('Q&A; time')).toBe('Q&amp;A; time');
    expect(decodeHtmlOnlyEntities('&notarealentityname;')).toBe('&amp;notarealentityname;');
  });

  it('never mutates Handlebars expressions or table markup', () => {
    const input = '<mj-table>{{#each items}}<tr><td>{{name}}</td></tr>{{/each}}</mj-table>';
    expect(decodeHtmlOnlyEntities(input)).toBe(input);
  });
});

describe('wrapFragment / unwrapFragment', () => {
  const fragment = '<mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section>';

  it('wraps a fragment in a full document and unwraps it back unchanged', () => {
    const wrapped = wrapFragment(fragment);
    expect(wrapped).toBe(`<mjml><mj-body>${fragment}</mj-body></mjml>`);
    expect(unwrapFragment(wrapped)).toBe(fragment);
  });

  it('leaves a full document unchanged on wrap, matching the backend detection', () => {
    const doc = '<mjml><mj-body></mj-body></mjml>';
    expect(wrapFragment(doc)).toBe(doc);
    // case-insensitive with attribute/boundary handling, like the backend regex
    expect(wrapFragment('<MJML lang="de"><mj-body></mj-body></MJML>')).toBe('<MJML lang="de"><mj-body></mj-body></MJML>');
    expect(wrapFragment('<mjmlx>not a document</mjmlx>')).toBe('<mjml><mj-body><mjmlx>not a document</mjmlx></mj-body></mjml>');
  });

  it('round-trips raw table markup with Handlebars each-blocks losslessly', () => {
    const table = '<mj-table>{{#each items}}<tr><td>{{name}}</td></tr>{{/each}}</mj-table>';
    const roundTripped = unwrapFragment(wrapFragment(table));
    expect(roundTripped).toContain('<tr>');
    expect(roundTripped).toContain('<td>');
    expect(roundTripped).toContain('{{#each items}}');
    expect(roundTripped).toContain('{{/each}}');
  });

  it('unwraps via the DOM, keeping attributes on mj-body out of the fragment', () => {
    const doc = '<mjml><mj-body width="600px"><mj-text>content</mj-text></mj-body></mjml>';
    expect(unwrapFragment(doc)).toBe('<mj-text>content</mj-text>');
  });

  it('passes a document without mj-body through unchanged', () => {
    expect(unwrapFragment('<mjml></mjml>')).toBe('<mjml></mjml>');
  });
});

describe('isWellFormedXml', () => {
  it('accepts well-formed markup and rejects HTML-isms', () => {
    expect(isWellFormedXml('<mjml><mj-body><br/></mj-body></mjml>')).toBe(true);
    expect(isWellFormedXml('<mjml><mj-body><br></mj-body></mjml>')).toBe(false);
    expect(isWellFormedXml('<mjml><mj-body>Terms & Conditions</mj-body></mjml>')).toBe(false);
  });
});

describe('email logo preview mapping', () => {
  const previewUrl = 'https://attraccess.example/api/logo.png';
  const cidImage = '<mj-image src="cid:attraccess-logo" />';

  it('uses the API image in the browser preview and restores the CID for saving', () => {
    const preview = withPreviewEmailLogo(cidImage, previewUrl);

    expect(preview).toBe(`<mj-image src="${previewUrl}" />`);
    expect(withCidEmailLogo(preview, previewUrl)).toBe(cidImage);
  });

  it('does not alter unrelated image sources', () => {
    const image = '<mj-image src="https://example.com/logo.png" />';

    expect(withPreviewEmailLogo(image, previewUrl)).toBe(image);
    expect(withCidEmailLogo(image, previewUrl)).toBe(image);
  });
});

describe('splitHead', () => {
  it('splits the mj-head off and leaves the rest verbatim', () => {
    const head = '<mj-head><mj-attributes><mj-text font-size="13px"/></mj-attributes></mj-head>';
    const { head: extracted, body } = splitHead(`<mjml>${head}<mj-body></mj-body></mjml>`);
    expect(extracted).toBe(head);
    expect(body).toBe('<mjml><mj-body></mj-body></mjml>');
  });

  it('returns an empty head when there is none', () => {
    expect(splitHead('<mjml><mj-body></mj-body></mjml>')).toEqual({
      head: '',
      body: '<mjml><mj-body></mj-body></mjml>',
    });
  });
});

describe('wrapInLayoutChrome / extractTemplateFragment', () => {
  const chrome = '<mj-section><mj-column><mj-text>Header</mj-text></mj-column></mj-section>';
  const layout = `<mjml><mj-body>${chrome}\n${CONTENT_PLACEHOLDER}\n${chrome.replace('Header', 'Footer')}</mj-body></mjml>`;
  const fragment = '<mj-section><mj-column><mj-text>Template content</mj-text></mj-column></mj-section>';

  it('tags chrome, injects the fragment, and extraction restores it', () => {
    const wrapped = wrapInLayoutChrome(layout, fragment);
    expect(wrapped).not.toBeNull();
    expect(wrapped).toContain(CHROME_CLASS);
    expect(wrapped).toContain('Template content');
    expect(extractTemplateFragment(wrapped as string)).toBe(fragment);
  });

  it('injects at the validated text node even when chrome text contains the placeholder token', () => {
    const trickyLayout =
      `<mjml><mj-body>` +
      `<mj-section><mj-column><mj-text>Docs: use ${CONTENT_PLACEHOLDER} in layouts</mj-text></mj-column></mj-section>` +
      `\n${CONTENT_PLACEHOLDER}\n` +
      `</mj-body></mjml>`;
    const wrapped = wrapInLayoutChrome(trickyLayout, fragment);
    expect(wrapped).not.toBeNull();
    // the chrome's literal mention must survive untouched…
    expect(wrapped).toContain(`Docs: use ${CONTENT_PLACEHOLDER} in layouts`);
    // …and the fragment must be extractable, i.e. it did not land inside chrome
    expect(extractTemplateFragment(wrapped as string)).toBe(fragment);
  });

  it('returns null when the placeholder is not a direct child of mj-body', () => {
    const noPlaceholder = `<mjml><mj-body>${chrome}</mj-body></mjml>`;
    expect(wrapInLayoutChrome(noPlaceholder, fragment)).toBeNull();
  });

  it('returns null when the combined document would not be well-formed XML', () => {
    expect(wrapInLayoutChrome(layout, '<mj-text>broken <br> markup</mj-text>')).toBeNull();
  });

  it('extraction refuses documents where chrome would leak into the fragment', () => {
    const wrapped = wrapInLayoutChrome(layout, fragment) as string;
    const chromeInsideFragment = wrapped.replace(
      'Template content',
      `Template content <span css-class="${CHROME_CLASS}">x</span>`,
    );
    expect(extractTemplateFragment(chromeInsideFragment)).toBeNull();
  });
});
