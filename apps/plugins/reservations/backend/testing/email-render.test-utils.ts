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

/**
 * The host converts the MJML body to HTML before Handlebars runs, so the tests do the same: MJML drops loose text
 * between its elements, which is what once removed every `{{#if}}` of a template. mjml is async, so all bodies are
 * converted once in a child process to keep `renderEmail` synchronous.
 */
let converted: Record<string, string> | undefined;
function mjmlBodies(): Record<string, string> {
  converted ??= JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `const mjml = require(process.argv.at(-1)); let input = '';
process.stdin.on('data', (chunk) => (input += chunk)).on('end', async () => {
  const out = {};
  for (const [id, body] of JSON.parse(input)) out[id] = (await mjml('<mjml><mj-body>' + body + '</mj-body></mjml>')).html;
  process.stdout.write(JSON.stringify(out));
});`,
        require.resolve('mjml'),
      ],
      { input: JSON.stringify(EMAIL_TEMPLATES.map((template) => [template.id, template.body])), encoding: 'utf8' },
    ),
  );
  return converted as Record<string, string>;
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
