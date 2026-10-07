import { CONTENT_PLACEHOLDER } from '../email-templates/edit/mjmlLayout';
export const PLACEHOLDER_CLASS = 'layout-content-placeholder';

export // The stored layout is a full <mjml> document with a raw {{content}} token in
// mj-body. GrapesJS would drop that bare text node, so for editing we swap it
// for a locked, visibly-marked section and swap back on save. The mj-head is
// split off too (GrapesJS has no mj-attributes component) and carried through
// verbatim; MjmlVisualEditor injects it into the canvas so styles still render.
const placeholderSection = (label: string) =>
  `<mj-section css-class="${PLACEHOLDER_CLASS}" background-color="#F1F5F9" border="2px dashed #94A3B8">` +
  `<mj-column><mj-text align="center" color="#64748B" font-size="14px">${label}</mj-text></mj-column>` +
  `</mj-section>`;

export const toEditable = (body: string, label: string) =>
  body.replace(CONTENT_PLACEHOLDER, () => placeholderSection(label));

export const toStorable = (editedDoc: string, head: string) =>
  editedDoc
    .replace(
      new RegExp(`<mj-section[^>]*css-class="[^"]*${PLACEHOLDER_CLASS}[^"]*"[\\s\\S]*?</mj-section>`),
      () => CONTENT_PLACEHOLDER,
    )
    // Tolerate attributes on the root tag (<mjml owa="desktop" lang="de">…) —
    // a literal '<mjml>' match would silently drop the head for such layouts.
    .replace(/<mjml([^>]*)>/, (_match, attrs) => `<mjml${attrs}>${head}`);
