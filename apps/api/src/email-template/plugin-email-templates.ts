import { extractTranslationKeys, isFullMjmlDocument } from '@attraccess/shared';
import type { PluginEmailTemplate, PluginLocalizedLabel } from '@attraccess/plugins-backend-sdk';
import { checkTemplateSyntax } from './template-syntax';

export type PluginEmailTemplateKey = `plugin.${string}`;

export interface RegisteredPluginEmailTemplate {
  /** Namespaced key, `plugin.<pluginName>.<id>`; also the `type` stored in the email template tables. */
  key: PluginEmailTemplateKey;
  pluginName: string;
  id: string;
  label: PluginLocalizedLabel;
  variables: string[];
  subject: string;
  body: string;
  translations: Record<string, Record<string, string>>;
}

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
/** Column length of `email_templates.subject`. */
const MAX_SUBJECT_LENGTH = 255;

const registry = new Map<string, RegisteredPluginEmailTemplate>();
let version = 0;

export function pluginEmailTemplateKey(pluginName: string, id: string): PluginEmailTemplateKey {
  return `plugin.${pluginName}.${id}`;
}

export function isPluginEmailTemplateKey(type: string): type is PluginEmailTemplateKey {
  return type.startsWith('plugin.');
}

function isTextMap(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && Object.values(value).every((entry) => typeof entry === 'string');
}

function validate(pluginName: string, template: PluginEmailTemplate): void {
  const where = `Plugin "${pluginName}" email template "${String(template?.id)}"`;
  if (typeof template?.id !== 'string' || !TEMPLATE_ID_PATTERN.test(template.id)) {
    throw new Error(
      `Plugin "${pluginName}" declares an invalid email template id "${String(template?.id)}". ` +
        'Use lowercase letters, digits, "-" and "_".',
    );
  }
  if (typeof template.label?.en !== 'string' || typeof template.label?.de !== 'string') {
    throw new Error(`${where} needs label.en and label.de.`);
  }
  if (!Array.isArray(template.variables) || template.variables.some((name) => typeof name !== 'string')) {
    throw new Error(`${where} needs a variables list of strings.`);
  }
  if (
    typeof template.subject !== 'string' ||
    !template.subject.trim() ||
    template.subject.length > MAX_SUBJECT_LENGTH
  ) {
    throw new Error(`${where} needs a subject of 1 to ${MAX_SUBJECT_LENGTH} characters.`);
  }
  if (typeof template.body !== 'string' || !template.body.trim()) throw new Error(`${where} needs a body.`);
  if (isFullMjmlDocument(template.body)) {
    throw new Error(`${where}: the body must be an MJML fragment without an <mjml> root element.`);
  }
  if (!template.translations || !Object.values(template.translations).every(isTextMap) || !template.translations.de) {
    throw new Error(`${where} needs translations.de (a map of translation key to text).`);
  }
  try {
    checkTemplateSyntax('The subject', template.subject);
    checkTemplateSyntax('The body', template.body);
  } catch (error) {
    throw new Error(`${where}: ${(error as Error).message}`);
  }
  const missing = extractTranslationKeys(`${template.subject}\n${template.body}`)
    .map(({ key }) => key)
    .filter((key) => typeof template.translations.de[key] !== 'string');
  if (missing.length > 0) {
    throw new Error(`${where} has no German translation for: ${missing.join(', ')}.`);
  }
}

/** Throws on a malformed declaration, which quarantines the plugin. Registering it afterwards cannot fail. */
export function validatePluginEmailTemplates(pluginName: string, templates: readonly PluginEmailTemplate[]): void {
  const seen = new Set<string>();
  for (const template of templates) {
    validate(pluginName, template);
    if (seen.has(template.id))
      throw new Error(`Plugin "${pluginName}" declares email template "${template.id}" twice.`);
    seen.add(template.id);
  }
}

/**
 * Registers the email templates one plugin declares. Replaces any earlier registration of the same plugin so
 * a reload never accumulates stale entries. Throws on a malformed declaration (quarantines the plugin).
 */
export function registerPluginEmailTemplates(pluginName: string, templates: readonly PluginEmailTemplate[]): void {
  validatePluginEmailTemplates(pluginName, templates);

  unregisterPluginEmailTemplates(pluginName);
  for (const template of templates) {
    const key = pluginEmailTemplateKey(pluginName, template.id);
    registry.set(key, {
      key,
      pluginName,
      id: template.id,
      label: { en: template.label.en, de: template.label.de },
      variables: [...template.variables],
      subject: template.subject,
      body: template.body,
      translations: Object.fromEntries(
        Object.entries(template.translations).map(([locale, texts]) => [locale, { ...texts }]),
      ),
    });
  }
  version += 1;
}

export function unregisterPluginEmailTemplates(pluginName: string): void {
  for (const [key, entry] of registry) {
    if (entry.pluginName === pluginName) registry.delete(key);
  }
  version += 1;
}

export function getPluginEmailTemplate(key: string): RegisteredPluginEmailTemplate | undefined {
  return registry.get(key);
}

export function listPluginEmailTemplates(): RegisteredPluginEmailTemplate[] {
  return [...registry.values()];
}

/** Changes whenever the registry does; lets the host sync stored templates only when something changed. */
export function pluginEmailTemplatesVersion(): number {
  return version;
}
