import type { PluginEmailTemplate } from '@attraccess/plugins-backend-sdk';
import { Condition, Paragraph, TEMPLATE_SPECS, TemplateSpec } from './template-specs';

/** `{name}` placeholders of the texts and the template variable each is filled from. */
export const PLACEHOLDERS: Readonly<Record<string, string>> = {
  resource: 'resource.name',
  when: 'reservation.when',
  start: 'reservation.startTime',
  end: 'reservation.endTime',
  note: 'reservation.note',
  decision: 'reservation.decisionReason',
  cancel: 'reservation.cancelReason',
  holder: 'holder.name',
  actor: 'actor.name',
  grace: 'checkIn.graceText',
  early: 'checkIn.earlyText',
  mstart: 'maintenance.start',
  mend: 'maintenance.end',
  mreason: 'maintenance.reason',
  details: 'health.reason',
};

const GREETING = { en: 'Hello {name},', de: 'Hallo {name},' };
const PLACEHOLDER = /\{(\w+)\}/g;

const placeholdersOf = (text: string): string[] => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];

function tCall(key: string, en: string, extra: Record<string, string> = {}): string {
  const names = placeholdersOf(en);
  const args = names.map((name) => `${name}=${extra[name] ?? PLACEHOLDERS[name] ?? name}`).join(' ');
  return `{{t "${key}" "${en}"${args ? ` ${args}` : ''}}}`;
}

function wrap(condition: Condition | undefined, inner: string): string {
  if (!condition) return inner;
  const [kind, path] = condition.split(':') as ['if' | 'unless', string];
  // mj-raw: MJML drops loose text between its elements, which would silently remove the block helpers.
  return `<mj-raw>{{#${kind} ${path}}}</mj-raw>${inner}<mj-raw>{{/${kind}}}</mj-raw>`;
}

const paragraph = ([key, en, , condition]: Paragraph): string =>
  wrap(condition, `<mj-text padding="0 0 12px 0">${tCall(key, en)}</mj-text>`);

function body(spec: TemplateSpec): string {
  const greeting = `<mj-text padding="0 0 12px 0">{{t "greeting" "${GREETING.en}" name=user.username}}</mj-text>`;
  const buttons = (spec.buttons ?? []).map(
    (b) => `<mj-button href="{{host.frontend}}${b.path}" align="center">{{t "${b.key}" "${b.en}"}}</mj-button>`,
  );
  return [
    '<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">',
    '  <mj-column>',
    ...[greeting, ...spec.paragraphs.map(paragraph), ...buttons].map((line) => `    ${line}`),
    '  </mj-column>',
    '</mj-section>',
  ].join('\n');
}

const VARIABLE_PATH = /(?:=|\{\{(?:#(?:if|unless) )?)([a-z][A-Za-z]*(?:\.[A-Za-z]+)+)/g;

function variablesOf(...sources: string[]): string[] {
  return [...new Set(sources.flatMap((source) => [...source.matchAll(VARIABLE_PATH)].map((m) => m[1])))];
}

function toTemplate(spec: TemplateSpec): PluginEmailTemplate {
  const subject = `{{t "subject" "${spec.subject.en}"${placeholdersOf(spec.subject.en)
    .map((n) => ` ${n}=${PLACEHOLDERS[n]}`)
    .join('')}}}`;
  const html = body(spec);
  const de: Record<string, string> = { subject: spec.subject.de, greeting: GREETING.de };
  for (const [key, , text] of spec.paragraphs) de[key] = text;
  for (const b of spec.buttons ?? []) de[b.key] = b.de;
  return {
    id: spec.id,
    label: spec.label,
    variables: variablesOf(subject, html),
    subject,
    body: html,
    translations: { de },
  };
}

/** The `PluginBackendModule.emailTemplates` declaration. */
export const EMAIL_TEMPLATES: PluginEmailTemplate[] = TEMPLATE_SPECS.map(toTemplate);
export type EmailTemplateId = string;
