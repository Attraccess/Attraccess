// Helpers for editing MJML in the context of the global email layout.
//
// The stored layout is a full <mjml> document with a raw {{content}} token in
// mj-body; templates are mj-body fragments injected into that token at send
// time. For WYSIWYG editing the two get combined: the layout's chrome
// (header/footer sections) is marked with CHROME_CLASS so the editor can lock
// it and the save path can strip it again, and the mj-head is split off since
// GrapesJS has no mj-attributes component (MjmlVisualEditor re-injects it into
// the canvas rendering via the headMjml prop).

export const CONTENT_PLACEHOLDER = '{{content}}';
export const CHROME_CLASS = 'atx-layout-chrome';

// The plugin's XML parser mode is the only one that keeps raw HTML inside
// mj-table intact, but it chokes on HTML-only named entities like &nbsp;.
// Decode those to plain characters so XML mode works for realistic content.
export const decodeHtmlOnlyEntities = (value: string) => {
  const decoder = document.createElement('textarea');
  return value.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)\w+;/g, (entity) => {
    decoder.innerHTML = entity;
    return decoder.value;
  });
};

export const splitHead = (doc: string) => {
  const match = doc.match(/<mj-head[\s\S]*?<\/mj-head>/);
  return { head: match?.[0] ?? '', body: match ? doc.replace(match[0], '') : doc };
};

const parseXml = (value: string): Document | null => {
  const doc = new DOMParser().parseFromString(decodeHtmlOnlyEntities(value), 'text/xml');
  return doc.querySelector('parsererror') ? null : doc;
};

/**
 * Combine the layout body (a full <mjml> document, head already split off) and a
 * template fragment into one editable document: every top-level layout element is
 * tagged with CHROME_CLASS and the fragment replaces the {{content}} text node.
 * Returns null when the layout can't be wrapped safely (malformed, no mj-body,
 * or {{content}} not a direct child of mj-body) — callers fall back to plain
 * fragment editing.
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

  const serialized = new XMLSerializer().serializeToString(doc.documentElement);
  return serialized.replace(CONTENT_PLACEHOLDER, () => fragment);
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
