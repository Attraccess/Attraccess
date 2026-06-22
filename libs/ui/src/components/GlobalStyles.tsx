/* Injects design tokens as CSS custom properties via a style tag.
   Use in environments where importing a CSS file is not possible (e.g. Electron renderer). */
const CSS = `
:root {
  --ui-bg: #0f172a;
  --ui-surface: #1e293b;
  --ui-text: #e2e8f0;
  --ui-text-muted: #94a3b8;
  --ui-border: #334155;
  --ui-input-bg: #0f172a;
  --ui-accent: #6366f1;
  --ui-accent-hover: #4f46e5;
  --ui-success: #34d399;
  --ui-error: #f87171;
  --ui-radius: 8px;
  --ui-radius-lg: 12px;
  --ui-font: system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--ui-font);
  background: var(--ui-bg);
  color: var(--ui-text);
}
`;

export function GlobalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
