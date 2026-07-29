export type TranslationDict = Record<string, string>;

/**
 * Translator for code-defined user-facing strings (push/toast notifications).
 * Admin-editable email templates are translated via the DB-backed {{t}}
 * Handlebars helper in the email-template module instead; this utility covers
 * strings that live in code, using JSON dictionaries co-located with their
 * listener/service (same pattern as the frontend).
 *
 * Resolution order: user's language ('de-AT' → 'de') → 'en' → the key itself.
 * `{variable}` placeholders are replaced from `vars`; unknown ones are left as-is.
 */
export function createTranslator(resources: Record<string, TranslationDict>) {
  return function translate(
    locale: string | null | undefined,
    key: string,
    vars?: Record<string, string | number>,
  ): string {
    const language = (locale ?? 'en').toLowerCase().split(/[-_]/)[0];
    const template = resources[language]?.[key] ?? resources.en?.[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (vars && name in vars ? String(vars[name]) : match));
  };
}
