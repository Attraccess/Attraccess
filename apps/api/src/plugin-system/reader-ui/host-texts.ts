import type { PluginBlockReason } from '@attraccess/plugins-backend-sdk';

export type ReaderUiLanguage = 'en' | 'de';

/** Reasons the host itself gives when a start cannot go ahead. Shown as written on readers and the web. */
export type HostReasonCode = 'HOOK_UNAVAILABLE' | 'CONFIRMATION_UNAVAILABLE' | 'STEP_EXPIRED' | 'STEP_UNKNOWN';

/**
 * Block codes only the host may send. Readers and the web treat them as host decisions (Lite plays its own
 * pattern on CONFIRMATION_REQUIRED), so a plugin block reason using one is invalid.
 */
export const HOST_RESERVED_BLOCK_CODES: readonly string[] = [
  'CONFIRMATION_REQUIRED',
  'CONFIRMATION_UNAVAILABLE',
  'HOOK_UNAVAILABLE',
  'STEP_EXPIRED',
  'STEP_UNKNOWN',
];

const TEXTS: Record<HostReasonCode, Record<ReaderUiLanguage, { title: string; body: string }>> = {
  HOOK_UNAVAILABLE: {
    en: {
      title: 'Temporarily unavailable',
      body: 'This resource cannot be started right now. Please try again in a minute or ask the team.',
    },
    de: {
      title: 'Vorübergehend nicht startbar',
      body: 'Diese Ressource kann gerade nicht gestartet werden. Bitte versuchen Sie es gleich erneut oder fragen Sie das Team.',
    },
  },
  CONFIRMATION_UNAVAILABLE: {
    en: {
      title: 'Confirmation not possible',
      body: 'This start needs a confirmation that cannot be shown right now. Please tap your card again.',
    },
    de: {
      title: 'Bestätigung nicht möglich',
      body: 'Dieser Start braucht eine Bestätigung, die gerade nicht angezeigt werden kann. Bitte halten Sie Ihre Karte erneut an.',
    },
  },
  STEP_EXPIRED: {
    en: { title: 'Confirmation expired', body: 'The confirmation took too long. Please start again.' },
    de: { title: 'Bestätigung abgelaufen', body: 'Die Bestätigung hat zu lange gedauert. Bitte starten Sie erneut.' },
  },
  STEP_UNKNOWN: {
    en: {
      title: 'Confirmation no longer valid',
      body: 'This confirmation was already used or replaced. Please start again.',
    },
    de: {
      title: 'Bestätigung nicht mehr gültig',
      body: 'Diese Bestätigung wurde schon verwendet oder ersetzt. Bitte starten Sie erneut.',
    },
  },
};

export function hostReason(code: HostReasonCode, language: ReaderUiLanguage | undefined): PluginBlockReason {
  const text = TEXTS[code][language === 'de' ? 'de' : 'en'];
  return { code, title: text.title, body: text.body };
}
