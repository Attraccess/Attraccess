import { useEffect, useMemo, useRef } from 'react';
import grapesjs from 'grapesjs';
import type { Component } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './MjmlVisualEditor.css';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { getBaseUrl } from '../../../api';
import { decodeHtmlOnlyEntities, unwrapFragment, withLogoPlaceholder, withPreviewEmailLogo } from './mjmlLayout';
import { unwrapDefault } from './MjmlVisualEditor.state';
import { grapesJSMJML } from './MjmlVisualEditor.state';
import { warningTranslations } from './MjmlVisualEditor.state';
import { MjmlVisualEditorProps } from './MjmlVisualEditor.mjml-visual-editor-props';
import { analyzeInitialValue } from './MjmlVisualEditor.state';

// grapesjs-mjml and the locale files ship as CJS; depending on the bundler's
// interop the callable/plain export is either the module itself or `.default`.
// GrapesJS canvases are unsandboxed iframes; script tags in mj-raw content
// would execute in the editing admin's browser session. Strip them from the
// canvas seed so the visual editor is safe regardless of template content.
// Templates that rely on scripts must use the code editor tab.
// Pure analysis of the initial value, shared between the mount effect (parser
// selection) and render (warning banners).

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
      const previewLogoUrl = `${getBaseUrl()}/api/logo.png`;

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
          { defaults?: Record<string, unknown> } | undefined;
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
            { getMjmlTemplate?: () => { start: string; end: string } } | undefined;
          const original = viewProto?.getMjmlTemplate;
          if (viewProto && original) {
            viewProto.getMjmlTemplate = function () {
              const tpl = original.call(this);
              return { ...tpl, start: tpl.start.replace('<mjml>', `<mjml>${headMjml}`) };
            };
          }
        });
      }

      editor.setComponents(withPreviewEmailLogo(initialMjml, previewLogoUrl));

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
            const mjml = withLogoPlaceholder(e.getHtml(), previewLogoUrl);
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
