import { BadRequestException } from '@nestjs/common';
import * as Handlebars from 'handlebars';

/** The only helper the send pipeline registers besides the built-ins (if, unless, each, with). */
const KNOWN_HELPERS = { t: true } as const;

/** Parse fine but fail at render time: the send pipeline registers no partials and no decorators. */
const UNSUPPORTED_NODES = new Set(['PartialStatement', 'PartialBlockStatement', 'Decorator', 'DecoratorBlock']);

/** A template the send pipeline could not render. The message names the part (`label`) and the problem. */
export class TemplateSyntaxError extends Error {}

/** Handlebars parse errors are `Parse error on line 1:`, the source, a caret line and the `Expecting ...` line; keep the first and last. */
function summarize(error: Error): string {
  const lines = error.message.split('\n');
  return lines.length > 1 ? `${lines[0]} ${lines.at(-1)}` : lines[0];
}

function hasUnsupportedNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasUnsupportedNode);
  if (UNSUPPORTED_NODES.has((node as { type?: string }).type ?? '')) return true;
  return Object.entries(node).some(([key, value]) => key !== 'loc' && hasUnsupportedNode(value));
}

/**
 * Throws a {@link TemplateSyntaxError} when `source` has Handlebars syntax errors, unknown helpers, partials
 * (`{{> name}}`) or decorators, which would otherwise make the mail fail at send time.
 */
export function checkTemplateSyntax(label: string, source: string): void {
  let ast: ReturnType<typeof Handlebars.parse>;
  try {
    ast = Handlebars.parse(source);
  } catch (error) {
    throw new TemplateSyntaxError(`${label} is not a valid template: ${summarize(error as Error)}`);
  }
  if (hasUnsupportedNode(ast)) {
    throw new TemplateSyntaxError(`${label} is not a valid template: partials and decorators are not supported`);
  }
  try {
    Handlebars.precompile(ast, { knownHelpers: KNOWN_HELPERS, knownHelpersOnly: true });
  } catch (error) {
    throw new TemplateSyntaxError(`${label} is not a valid template: ${summarize(error as Error)}`);
  }
}

function assertCompiles(label: string, source: string): void {
  try {
    checkTemplateSyntax(label, source);
  } catch (error) {
    if (error instanceof TemplateSyntaxError) throw new BadRequestException(error.message);
    throw error;
  }
}

/**
 * Rejects an edit that the send pipeline could not render: an empty subject or body, a body without any MJML element
 * (the mail would carry only the layout) and template errors (see {@link checkTemplateSyntax}), which would otherwise
 * make the mail fail at send time without the admin noticing.
 */
export function assertRenderableTemplate(edit: { subject?: string; body?: string }): void {
  if (edit.subject !== undefined) {
    if (!edit.subject.trim()) throw new BadRequestException('Subject must not be empty');
    assertCompiles('Subject', edit.subject);
  }
  if (edit.body !== undefined) {
    if (!edit.body.trim()) throw new BadRequestException('Body must not be empty');
    if (!/<mj-/.test(edit.body)) throw new BadRequestException('Body must contain MJML elements such as <mj-section>');
    assertCompiles('Body', edit.body);
  }
}
