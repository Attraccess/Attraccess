import { execFileSync } from 'node:child_process';
import * as Handlebars from 'handlebars';
import { EMAIL_TEMPLATES } from '../notifications/email/build';

export interface RenderedEmail {
  subject: string;
  html: string;
  /** Tags dropped, whitespace collapsed. */
  text: string;
  hrefs: string[];
}

export interface MjmlResult {
  html: string;
  /** What MJML reports for the document; the host refuses to store or save a body with any. */
  errors: string[];
}

const mjmlCache = new Map<string, MjmlResult>();

/**
 * Converts whole MJML documents with the real `mjml` package. mjml is async and its ESM internals do not load
 * under Jest, so the documents run in one child process; results are cached per document.
 */
export function convertMjmlDocuments(documents: readonly string[]): Map<string, MjmlResult> {
  const missing = [...new Set(documents)].filter((document) => !mjmlCache.has(document));
  if (missing.length > 0) {
    const results: MjmlResult[] = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          `const mjml = require(process.argv.at(-1)); let input = '';
process.stdin.on('data', (chunk) => (input += chunk)).on('end', async () => {
  const out = [];
  for (const document of JSON.parse(input)) {
    const result = await mjml(document);
    out.push({ html: result.html, errors: (result.errors ?? []).map((error) => error.formattedMessage ?? error.message) });
  }
  process.stdout.write(JSON.stringify(out));
});`,
          require.resolve('mjml'),
        ],
        { input: JSON.stringify(missing), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      ),
    );
    missing.forEach((document, index) => mjmlCache.set(document, results[index]));
  }
  return new Map(documents.map((document) => [document, mjmlCache.get(document) as MjmlResult]));
}

/** The document the host validates and converts for a template body (EmailTemplateService). */
export const mjmlDocumentOf = (body: string): string => `<mjml><mj-body>${body}</mj-body></mjml>`;

/**
 * The host converts the MJML body to HTML before Handlebars runs, so the tests do the same: MJML drops loose text
 * between its elements, which is what once removed every `{{#if}}` of a template. A body MJML reports errors for
 * fails here, as the host would refuse it (the template is never registered, an admin's save gets a 400).
 */
let converted: Record<string, string> | undefined;
function mjmlBodies(): Record<string, string> {
  if (converted) return converted;
  const results = convertMjmlDocuments(EMAIL_TEMPLATES.map((template) => mjmlDocumentOf(template.body)));
  const bodies: Record<string, string> = {};
  for (const template of EMAIL_TEMPLATES) {
    const result = results.get(mjmlDocumentOf(template.body)) as MjmlResult;
    if (result.errors.length > 0) {
      throw new Error(`MJML reports errors for email template "${template.id}": ${result.errors.join('; ')}`);
    }
    bodies[template.id] = result.html;
  }
  converted = bodies;
  return bodies;
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
  const document = Handlebars.compile(mjmlBodies()[template.id])(context, options);
  const html = document.slice(document.indexOf('<body'));
  return {
    subject,
    html,
    text: html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    hrefs: [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]),
  };
}
