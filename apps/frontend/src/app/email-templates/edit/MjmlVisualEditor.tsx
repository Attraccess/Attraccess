import { useEffect, useMemo, useRef } from 'react';
import grapesjs from 'grapesjs';
import type { Component } from 'grapesjs';
import grapesJSMJMLModule from 'grapesjs-mjml';
import 'grapesjs/dist/css/grapes.min.css';
import './MjmlVisualEditor.css';
import { isFullMjmlDocument } from '@attraccess/shared';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { decodeHtmlOnlyEntities, isWellFormedXml, splitHead, unwrapFragment, wrapFragment } from './mjmlLayout';

// grapesjs-mjml and the locale files ship as CJS; depending on the bundler's
// interop the callable/plain export is either the module itself or `.default`.
const unwrapDefault = <T,>(mod: T): T => (mod as { default?: T })?.default ?? mod;
const grapesJSMJML = unwrapDefault(grapesJSMJMLModule);

const warningTranslations = {
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

interface MjmlVisualEditorProps {
  /** MJML fragment (mj-section...) or full <mjml> document. Read once on mount — remount (key) to reload. */
  initialValue: string;
  onChange: (mjml: string) => void;
  language: string;
  /**
   * mj-head fragment (e.g. "<mj-head><mj-attributes>...</mj-attributes></mj-head>") injected into the
   * per-component MJML compile so global styles render in the canvas. Not editable, never exported.
   */
  headMjml?: string;
  /** Components whose css-class contains this become inert: visible but not selectable/editable/removable. */
  lockClass?: string;
  /** Report the full <mjml> document (incl. mj-body attributes) from onChange instead of the body fragment. */
  exportFullDocument?: boolean;
}

// GrapesJS canvases are unsandboxed iframes; script tags in mj-raw content
// would execute in the editing admin's browser session. Strip them from the
// canvas seed so the visual editor is safe regardless of template content.
// Templates that rely on scripts must use the code editor tab.
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const stripScripts = (mjml: string) => mjml.replace(SCRIPT_TAG_RE, '');

// Pure analysis of the initial value, shared between the mount effect (parser
// selection) and render (warning banners).
const analyzeInitialValue = (initialValue: string) => {
  const raw = decodeHtmlOnlyEntities(initialValue);
  const { head, body } = isFullMjmlDocument(raw) ? splitHead(raw) : { head: '', body: raw };
  const wrapped = wrapFragment(body);
  const initialMjml = stripScripts(wrapped);
  const scriptsStripped = initialMjml !== wrapped;
  return { initialMjml, droppedHead: head, useXmlParser: isWellFormedXml(initialMjml), scriptsStripped };
};

export function MjmlVisualEditor(props: MjmlVisualEditorProps) {
  const { t } = useTranslations(warningTranslations);
  const containerRef = useRef<HTMLDivElement>(null);

  const propsRef = useRef(props);
  propsRef.current = props;

  const analysis = useMemo(() => analyzeInitialValue(props.initialValue), [props.initialValue]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let editor: ReturnType<typeof grapesjs.init> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      const { initialMjml, droppedHead, useXmlParser } = analyzeInitialValue(propsRef.current.initialValue);

      // Load de locale bundles only for German users — English users shouldn't pay for them.
      const language = propsRef.current.language;
      const [grapesjsDe, grapesjsMjmlDe] =
        language === 'de'
          ? await Promise.all([
              import('grapesjs/locale/de').then(unwrapDefault),
              import('grapesjs-mjml/locale/de').then(unwrapDefault),
            ])
          : [undefined, undefined];

      if (cancelled) return;

      editor = grapesjs.init({
        container,
        fromElement: false,
        height: '100%',
        storageManager: false,
        // Text edits are re-parsed on commit, and the browser re-encodes nbsp & co.
        // as HTML-only entities the XML parser rejects — without this, an edit next
        // to an &nbsp; injects a literal <parsererror> element into the component
        // tree, which then gets exported and saved. Decode before every parse.
        parser: { optionsHtml: { preParser: decodeHtmlOnlyEntities } },
        i18n: {
          locale: language,
          ...(grapesjsDe ? { messages: { de: grapesjsDe } } : {}),
        },
        plugins: [
          (instance) =>
            grapesJSMJML(instance, {
              useXmlParser,
              ...(grapesjsMjmlDe ? { i18n: { de: grapesjsMjmlDe } } : {}),
            }),
        ],
      });

    // grapesjs-mjml merges each component's 'style-default' (MJML spec defaults)
    // into its attributes on import and strips matching attributes on export.
    // Our layout overrides those defaults via mj-attributes, so stripping e.g.
    // font-size="13px" silently changes the rendered email. Empty the
    // 'style-default' maps so imported attributes round-trip verbatim. The rest
    // of the type's defaults is spread back in so this stays correct whether
    // addType merges or replaces the previous defaults object (traits, drag
    // flags etc. must survive).
    editor.Components.getTypes().forEach((type) => {
      const proto = editor.Components.getType(type.id)?.model?.prototype as
        | { defaults?: Record<string, unknown> }
        | undefined;
      if (proto?.defaults?.['style-default']) {
        editor.Components.addType(type.id, { model: { defaults: { ...proto.defaults, 'style-default': {} } } });
      }
    });

    // grapesjs-mjml renders each component by compiling a standalone
    // "<mjml><mj-body>...</mj-body></mjml>" mini-document, so mj-head styles
    // (mj-attributes, mj-style) never apply in the canvas. Splice the head
    // into every mini-document so the canvas matches the final email. For a
    // legacy full-document template its own head is used, so the canvas shows
    // the styles the warning banner says will be dropped on save.
    const headMjml = propsRef.current.headMjml || droppedHead;
    if (headMjml) {
      editor.Components.getTypes().forEach((type) => {
        const viewProto = editor.Components.getType(type.id)?.view?.prototype as
          | { getMjmlTemplate?: () => { start: string; end: string } }
          | undefined;
        const original = viewProto?.getMjmlTemplate;
        if (viewProto && original) {
          viewProto.getMjmlTemplate = function () {
            const tpl = original.call(this);
            return { ...tpl, start: tpl.start.replace('<mjml>', `<mjml>${headMjml}`) };
          };
        }
      });
    }

    editor.setComponents(initialMjml);

    const lockClass = propsRef.current.lockClass;
    if (lockClass) {
      editor.getWrapper()?.onAll((component) => {
        const isLocked = (c: Component | undefined): boolean =>
          !!c && (String(c.getAttributes()['css-class'] ?? '').includes(lockClass) || isLocked(c.parent()));
        if (isLocked(component)) {
          component.set({
            locked: true,
            selectable: false,
            hoverable: false,
            editable: false,
            draggable: false,
            droppable: false,
            copyable: false,
            removable: false,
            highlightable: false,
          });
        }
      });
    }

    // Attach inside onReady: grapesjs-mjml fires its initial normalization
    // 'update' events synchronously during setComponents() — before onReady
    // signals that the canvas is ready. Any 'update' received here is therefore
    // from a user edit, not load-time parsing. The 300ms debounce also absorbs
    // any rare late-firing plugin event without silently overwriting user work.
    const e = editor;
    e.onReady(() => {
      if (cancelled) return;
      e.on('update', () => {
        if (cancelled) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (cancelled) return;
          const mjml = e.getHtml();
          propsRef.current.onChange(propsRef.current.exportFullDocument ? mjml : unwrapFragment(mjml));
        }, 300);
      });
    });

    // Handle for e2e tests and debugging (the canvas is otherwise unreachable from outside).
    (container as HTMLDivElement & { __grapesEditor?: unknown }).__grapesEditor = editor;
    };

    void run();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      editor?.destroy();
    };
  }, []);

  const warnings = [
    !analysis.useXmlParser && { key: 'parser', text: t('htmlParserFallback') },
    !props.exportFullDocument && analysis.droppedHead && { key: 'head', text: t('headDropped') },
    analysis.scriptsStripped && { key: 'scripts', text: t('scriptsStripped') },
  ].filter(Boolean) as { key: string; text: string }[];

  return (
    <div className="h-full w-full flex flex-col">
      {warnings.map((warning) => (
        <p
          key={warning.key}
          className="px-3 py-2 text-xs bg-warning-100 text-warning-800 border-b border-warning-200"
          data-cy={`mjml-visual-editor-warning-${warning.key}`}
        >
          {warning.text}
        </p>
      ))}
      <div ref={containerRef} className="mjml-visual-editor flex-1 min-h-0 w-full" data-cy="mjml-visual-editor" />
    </div>
  );
}
