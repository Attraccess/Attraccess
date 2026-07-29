// Helpers for editing MJML in the context of the global email layout.
//
// The stored layout is a full <mjml> document with a raw {{content}} token in
// mj-body; templates are mj-body fragments injected into that token at send
// time. For WYSIWYG editing the two get combined: the layout's chrome
// (header/footer sections) is marked with CHROME_CLASS so the editor can lock
// it and the save path can strip it again, and the mj-head is split off since
// GrapesJS has no mj-attributes component (MjmlVisualEditor re-injects it into
// the canvas rendering via the headMjml prop).

import { isFullMjmlDocument } from '@attraccess/shared';

export const CONTENT_PLACEHOLDER = '{{content}}';
export const CHROME_CLASS = 'atx-layout-chrome';

// Element name used internally to mark the validated {{content}} position so
// the fragment splice can't hit a stray "{{content}}" inside chrome text.
const CONTENT_MARKER_TAG = 'atx-content-marker';

// The plugin's XML parser mode is the only one that keeps raw HTML inside
// mj-table intact, but it chokes on HTML-only named entities like &nbsp; and
// on bare ampersands in ordinary copy ("Terms & Conditions"). Decode the
// former to plain characters and escape the latter to &amp; so XML mode works
// for realistic content. Anything that only *looks* like an entity (&foo;) is
// escaped rather than decoded, so unrecognized text never gets mutated.

// Shared DOMParser — stateless, safe to reuse across calls.
const _htmlDecoder = typeof document !== 'undefined' ? new DOMParser() : null;

export const decodeHtmlOnlyEntities = (value: string) => {
  return value.replace(/&(?:(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);|(\w+;))?/g, (match, xmlEntity, named) => {
    if (xmlEntity) return match; // already XML-safe, keep verbatim
    if (!named) return '&amp;'; // bare ampersand — illegal in XML
    if (!_htmlDecoder) return `&amp;${named}`;
    // Decode via HTML5 parser and read textContent; avoids innerHTML XSS surface.
    // match is always &\w+; — no HTML tags can appear inside \w+.
    const decoded = _htmlDecoder.parseFromString(match, 'text/html').body.textContent ?? '';
    // A clean entity decode never ends with ';'. If it does, the parser matched
    // a shorter legacy entity prefix (e.g. &not inside &notarealentityname;) and
    // left the remainder as literal text — treat as unknown and escape instead.
    return decoded !== match && !decoded.includes('&') && !decoded.endsWith(';') ? decoded : `&amp;${named}`;
  });
};

export const splitHead = (doc: string) => {
  const match = doc.match(/<mj-head[\s\S]*?<\/mj-head>/);
  return { head: match?.[0] ?? '', body: match ? doc.replace(match[0], '') : doc };
};

export const wrapFragment = (value: string) =>
  isFullMjmlDocument(value) ? value : `<mjml><mj-body>${value}</mj-body></mjml>`;

export const isWellFormedXml = (value: string) => {
  // Bare & not part of an entity reference is always invalid in XML. Some
  // lenient parsers silently accept it, so reject it explicitly before parsing.
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+|\w+);)/.test(value)) return false;
  return !new DOMParser().parseFromString(value, 'text/xml').querySelector('parsererror');
};

const parseXml = (value: string): Document | null => {
  const doc = new DOMParser().parseFromString(decodeHtmlOnlyEntities(value), 'text/xml');
  return doc.querySelector('parsererror') ? null : doc;
};

/**
 * Extract the mj-body inner content from a full <mjml> document. DOM-based so
 * literal "</mj-body>" text inside the content can't derail it; falls back to
 * a regex when the document isn't parseable as XML. When no <mj-body> is found
 * at all the document is passed through unchanged (the backend rejects full
 * documents, so this can't silently persist a nested-<mjml> body).
 */
export const unwrapFragment = (mjml: string) => {
  const body = parseXml(mjml)?.querySelector('mj-body');
  if (body) {
    const serializer = new XMLSerializer();
    return Array.from(body.childNodes)
      .map((node) => serializer.serializeToString(node))
      .join('')
      .trim();
  }
  const match = mjml.match(/<mj-body[^>]*>([\s\S]*)<\/mj-body>/);
  if (!match) {
    console.warn('unwrapFragment: exported document contains no <mj-body>; passing it through unchanged');
  }
  return (match ? match[1] : mjml).trim();
};

/**
 * Combine the layout body (a full <mjml> document, head already split off) and a
 * template fragment into one editable document: every top-level layout element is
 * tagged with CHROME_CLASS and the fragment replaces the {{content}} text node.
 * Returns null when the layout can't be wrapped safely (malformed, no mj-body,
 * {{content}} not a direct child of mj-body, or the combined result isn't
 * well-formed XML) — callers fall back to plain fragment editing.
 */
export function wrapInLayoutChrome(layoutDoc: string, fragment: string): string | null {
  const doc = parseXml(layoutDoc);
  const body = doc?.querySelector('mj-body');
  if (!doc || !body) return null;

  const contentNode = Array.from(body.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').includes(CONTENT_PLACEHOLDER),
  );
  if (!contentNode) return null;

  Array.from(body.children).forEach((el) => {
    const existing = el.getAttribute('css-class');
    el.setAttribute('css-class', existing ? `${existing} ${CHROME_CLASS}` : CHROME_CLASS);
  });

  // Swap the validated text node for a marker element before serializing, so
  // the fragment is spliced at exactly this position even if some chrome text
  // elsewhere in the layout also contains the literal placeholder token.
  const [before, ...rest] = (contentNode.textContent ?? '').split(CONTENT_PLACEHOLDER);
  const replacement = doc.createDocumentFragment();
  if (before) replacement.appendChild(doc.createTextNode(before));
  replacement.appendChild(doc.createElement(CONTENT_MARKER_TAG));
  const after = rest.join('');
  if (after) replacement.appendChild(doc.createTextNode(after));
  body.replaceChild(replacement, contentNode);

  const serialized = new XMLSerializer().serializeToString(doc.documentElement);
  // XMLSerializer may add xmlns attributes to the marker element; [^>]* tolerates them.
  const markerPattern = new RegExp(`<${CONTENT_MARKER_TAG}[^>]*/>|<${CONTENT_MARKER_TAG}[^>]*>\\s*</${CONTENT_MARKER_TAG}>`);
  const result = serialized.replace(markerPattern, () => fragment);

  // If the fragment itself isn't XML-clean the editor would import this via the
  // lossy HTML parser but extraction (which requires XML) could never save it.
  // Better to fall back to plain fragment editing, which stays saveable.
  return isWellFormedXml(decodeHtmlOnlyEntities(result)) ? result : null;
}

/**
 * Inverse of wrapInLayoutChrome: drop the chrome-tagged top-level elements from
 * an edited document and return only the template fragment. Returns null when
 * extraction isn't safe (malformed document or chrome markup would leak into
 * the fragment) — callers must not save in that case.
 */
export function extractTemplateFragment(editedDoc: string): string | null {
  const doc = parseXml(editedDoc);
  const body = doc?.querySelector('mj-body');
  if (!doc || !body) return null;

  const serializer = new XMLSerializer();
  const parts: string[] = [];
  Array.from(body.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && ((node as Element).getAttribute('css-class') ?? '').includes(CHROME_CLASS)) {
      return;
    }
    const serialized = serializer.serializeToString(node).trim();
    if (serialized) parts.push(serialized);
  });

  const fragment = parts.join('\n');
  return fragment.includes(CHROME_CLASS) ? null : fragment;
}
