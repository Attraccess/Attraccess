// jsdom has no `CSS` global; react-aria (>= 3.53) calls `CSS.escape` when overlays open. Browsers and happy-dom have it.
import cssEscape from 'css.escape';

globalThis.CSS ??= { escape: cssEscape } as unknown as typeof CSS;
