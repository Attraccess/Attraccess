import * as Handlebars from 'handlebars';
import { EMAIL_TEMPLATES } from '../notifications/email/build';

export interface RenderedEmail {
  subject: string;
  html: string;
  /** Tags dropped, whitespace collapsed. */
  text: string;
  hrefs: string[];
}

export interface EmailRequest {
  template: string;
  variables: Record<string, unknown>;
}

/**
 * Renders a declared template the way the host does for a recipient: the `t` helper picks the shipped German
 * text (or the inline English default) and fills `{placeholders}` from its escaped arguments; `user`, `host`
 * and `url` come from the host. A mirror of the host's EmailService.convertTemplate for tests.
 */
export function renderEmail(email: EmailRequest, lang: 'en' | 'de', frontend = 'https://app.test'): RenderedEmail {
  const template = EMAIL_TEMPLATES.find((candidate) => candidate.id === email.template);
  if (!template) throw new Error(`Unknown email template "${email.template}"`);
  const texts = lang === 'de' ? template.translations.de : {};
  const t = (key: string, fallback: string, options: Handlebars.HelperOptions) => {
    const hash = options.hash ?? {};
    const raw = texts[key] || fallback;
    return new Handlebars.SafeString(
      raw.replace(/\{(\w+(?:\.\w+)*)\}/g, (_: string, name: string) =>
        Object.hasOwn(hash, name) ? Handlebars.escapeExpression(String(hash[name] ?? '')) : `{${name}}`,
      ),
    );
  };
  const context = { ...email.variables, user: { username: 'tester' }, host: { frontend }, url: frontend };
  const options = { helpers: { t } };
  const subject = Handlebars.compile(template.subject)(context, options);
  const html = Handlebars.compile(template.body)(context, options);
  return {
    subject,
    html,
    text: html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    hrefs: [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]),
  };
}
