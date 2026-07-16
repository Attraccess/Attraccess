import { useEffect, useRef } from 'react';
import grapesjs from 'grapesjs';
import grapesJSMJMLModule from 'grapesjs-mjml';
import grapesjsDeModule from 'grapesjs/locale/de';
import grapesjsMjmlDeModule from 'grapesjs-mjml/locale/de';
import 'grapesjs/dist/css/grapes.min.css';
import './MjmlVisualEditor.css';

// grapesjs-mjml and the locale files ship as CJS; depending on the bundler's
// interop the callable/plain export is either the module itself or `.default`.
const unwrapDefault = <T,>(mod: T): T => (mod as { default?: T })?.default ?? mod;
const grapesJSMJML = unwrapDefault(grapesJSMJMLModule);
const grapesjsDe = unwrapDefault(grapesjsDeModule);
const grapesjsMjmlDe = unwrapDefault(grapesjsMjmlDeModule);

interface MjmlVisualEditorProps {
  /** MJML fragment (mj-section...) or full <mjml> document. Read once on mount — remount (key) to reload. */
  initialValue: string;
  onChange: (mjml: string) => void;
  language: string;
}

const wrapFragment = (value: string) =>
  value.trimStart().startsWith('<mjml') ? value : `<mjml><mj-body>${value}</mj-body></mjml>`;

const unwrapFragment = (mjml: string) => {
  const match = mjml.match(/<mj-body[^>]*>([\s\S]*)<\/mj-body>/);
  return (match ? match[1] : mjml).trim();
};

// The plugin's XML parser mode is the only one that keeps raw HTML inside
// mj-table intact, but it chokes on HTML-only named entities like &nbsp;.
// Decode those to plain characters so XML mode works for realistic content.
const decodeHtmlOnlyEntities = (value: string) => {
  const decoder = document.createElement('textarea');
  return value.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)\w+;/g, (entity) => {
    decoder.innerHTML = entity;
    return decoder.value;
  });
};

// If the content still isn't well-formed XML, fall back to the HTML parser —
// it mangles raw table markup but never truncates the document.
const isWellFormedXml = (value: string) =>
  !new DOMParser().parseFromString(value, 'text/xml').querySelector('parsererror');

export function MjmlVisualEditor(props: MjmlVisualEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const initialMjml = wrapFragment(decodeHtmlOnlyEntities(propsRef.current.initialValue));

    const editor = grapesjs.init({
      container,
      fromElement: false,
      height: '100%',
      storageManager: false,
      i18n: {
        locale: propsRef.current.language,
        messages: { de: grapesjsDe },
      },
      plugins: [
        (instance) =>
          grapesJSMJML(instance, {
            useXmlParser: isWellFormedXml(initialMjml),
            i18n: { de: grapesjsMjmlDe },
          }),
      ],
    });

    // grapesjs-mjml merges each component's 'style-default' (MJML spec defaults)
    // into its attributes on import and strips matching attributes on export.
    // Our layout overrides those defaults via mj-attributes, so stripping e.g.
    // font-size="13px" silently changes the rendered email. Empty the
    // 'style-default' maps so imported attributes round-trip verbatim.
    editor.Components.getTypes().forEach((type) => {
      const proto = editor.Components.getType(type.id)?.model?.prototype as
        | { defaults?: Record<string, unknown> }
        | undefined;
      if (proto?.defaults?.['style-default']) {
        editor.Components.addType(type.id, { model: { defaults: { 'style-default': {} } } });
      }
    });

    editor.setComponents(initialMjml);

    editor.onReady(() => {
      // ponytail: listener attached after initial parse settles, so load-time
      // normalization never clobbers untouched templates — only user edits do.
      setTimeout(() => {
        editor.on('update', () => propsRef.current.onChange(unwrapFragment(editor.getHtml())));
      }, 0);
    });

    return () => editor.destroy();
  }, []);

  return <div ref={containerRef} className="mjml-visual-editor h-full w-full" data-cy="mjml-visual-editor" />;
}
