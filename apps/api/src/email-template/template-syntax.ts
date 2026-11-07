import { BadRequestException } from '@nestjs/common';
import * as Handlebars from 'handlebars';

/** The only helper the send pipeline registers besides the built-ins (if, unless, each, with). */
const KNOWN_HELPERS = { t: true } as const;

/** Handlebars parse errors are `Parse error on line 1:`, the source, a caret line and the `Expecting ...` line; keep the first and last. */
function summarize(error: Error): string {
  const lines = error.message.split('\n');
  return lines.length > 1 ? `${lines[0]} ${lines.at(-1)}` : lines[0];
}

function assertCompiles(label: string, source: string): void {
  try {
    Handlebars.precompile(source, { knownHelpers: KNOWN_HELPERS, knownHelpersOnly: true });
  } catch (error) {
    throw new BadRequestException(`${label} is not a valid template: ${summarize(error as Error)}`);
  }
}

/**
 * Rejects an edit that the send pipeline could not render: an empty subject or body, a body without any MJML element
 * (the mail would carry only the layout) and Handlebars syntax errors or unknown helpers, which would otherwise
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
