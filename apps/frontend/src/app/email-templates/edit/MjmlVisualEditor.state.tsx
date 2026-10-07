import { isFullMjmlDocument } from '@attraccess/shared';
import { decodeHtmlOnlyEntities } from './mjmlLayout';
import { isWellFormedXml } from './mjmlLayout';
import { splitHead } from './mjmlLayout';
import { wrapFragment } from './mjmlLayout';
import grapesJSMJMLModule from 'grapesjs-mjml';
import { stripScripts } from './strip-preview-scripts';
export { stripScripts } from './strip-preview-scripts';

export // Pure analysis of the initial value, shared between the mount effect (parser
// selection) and render (warning banners).
const analyzeInitialValue = (initialValue: string) => {
  const raw = decodeHtmlOnlyEntities(initialValue);
  const { head, body } = isFullMjmlDocument(raw) ? splitHead(raw) : { head: '', body: raw };
  const wrapped = wrapFragment(body);
  const initialMjml = stripScripts(wrapped);
  const scriptsStripped = initialMjml !== wrapped;
  return { initialMjml, droppedHead: head, useXmlParser: isWellFormedXml(initialMjml), scriptsStripped };
};
export // grapesjs-mjml and the locale files ship as CJS; depending on the bundler's
// interop the callable/plain export is either the module itself or `.default`.
const unwrapDefault = <T,>(mod: T): T => (mod as { default?: T })?.default ?? mod;

export const grapesJSMJML = unwrapDefault(grapesJSMJMLModule);
export const warningTranslations = {
  en: {
    htmlParserFallback:
      'This template is not well-formed XML, so a lossier parser is used: raw HTML table markup may be reformatted by visual edits. Fix the markup in the code editor to avoid this.',
    headDropped:
      'This template contains document-level styles (<mj-head>) that the visual editor cannot keep. Saving will remove them; the global layout styles apply instead.',
    scriptsStripped:
      'This template contains <script> tags that have been removed from the visual preview. Switch to the code editor to edit templates with scripts.',
  },
  de: {
    htmlParserFallback:
      'Diese Vorlage ist kein wohlgeformtes XML, daher wird ein verlustbehafteter Parser verwendet: rohes HTML-Tabellen-Markup kann durch visuelle Bearbeitungen umformatiert werden. Korrigiere das Markup im Code-Editor, um das zu vermeiden.',
    headDropped:
      'Diese Vorlage enthält Dokument-Styles (<mj-head>), die der visuelle Editor nicht übernehmen kann. Beim Speichern werden sie entfernt; stattdessen gelten die Styles des globalen Layouts.',
    scriptsStripped:
      'Diese Vorlage enthält <script>-Tags, die aus der visuellen Vorschau entfernt wurden. Wechsle zum Code-Editor, um Vorlagen mit Skripten zu bearbeiten.',
  },
};
