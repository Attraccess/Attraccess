export interface MjmlVisualEditorProps {
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
