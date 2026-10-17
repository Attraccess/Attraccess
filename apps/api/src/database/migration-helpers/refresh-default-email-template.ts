import { createHash } from 'node:crypto';
import { QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { readDefaultTemplateBody } from '../../email-template/email-defaults';

/** Refresh recognized shipped bodies only. Returns false when the template is absent. */
export async function refreshDefaultEmailTemplate(
  runner: QueryRunner,
  type: EmailTemplateType,
  previousBodyHashes: readonly string[],
  additionalVariables?: readonly string[],
): Promise<boolean> {
  const [template]: { body: string; variables?: string }[] = await runner.query(
    `SELECT "body"${additionalVariables ? ', "variables"' : ''} FROM "email_templates" WHERE "type" = ?`,
    [type],
  );
  if (!template) return false;

  const hash = createHash('sha256').update(template.body.replace(/\r\n?/g, '\n').trim()).digest('hex');
  if (!previousBodyHashes.includes(hash)) return true;

  const body = readDefaultTemplateBody(type);
  if (additionalVariables) {
    const variables = [...new Set([...(template.variables ?? '').split(','), ...additionalVariables])]
      .filter(Boolean)
      .join(',');
    if (body === template.body && variables === template.variables) return true;
    // Match both read columns so concurrent administrator edits win.
    await runner.query(
      'UPDATE "email_templates" SET "body" = ?, "variables" = ? WHERE "type" = ? AND "body" = ? AND "variables" = ?',
      [body, variables, type, template.body, template.variables],
    );
  } else if (body !== template.body) {
    await runner.query('UPDATE "email_templates" SET "body" = ? WHERE "type" = ? AND "body" = ?', [
      body,
      type,
      template.body,
    ]);
  }
  return true;
}
