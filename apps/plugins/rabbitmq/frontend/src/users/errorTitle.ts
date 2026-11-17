import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';

// A failure without a server message falls back to the generic text, which is
// already the title — show it only once, as the description.
export function errorTitle(error: string | TranslationMessage, title: string) {
  return typeof error === 'string' ? title : undefined;
}
