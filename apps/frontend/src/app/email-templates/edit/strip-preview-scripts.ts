import { isWellFormedXml } from './mjmlLayout';

function removeScripts(root: Document | DocumentFragment): boolean {
  let removed = false;
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (element.localName.toLowerCase() === 'script') {
      element.remove();
      removed = true;
    } else if (element instanceof HTMLTemplateElement) {
      removed = removeScripts(element.content) || removed;
    }
  }
  return removed;
}

/** Remove executable elements before seeding the unsandboxed GrapesJS canvas. */
export function stripScripts(mjml: string): string {
  const xml = isWellFormedXml(mjml);
  const document = new DOMParser().parseFromString(mjml, xml ? 'application/xml' : 'text/html');
  if (!removeScripts(document)) return mjml;
  return xml ? new XMLSerializer().serializeToString(document) : document.body.innerHTML;
}
