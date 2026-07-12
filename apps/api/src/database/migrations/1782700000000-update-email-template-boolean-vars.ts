import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';

function readTemplate(name: string): string {
  return readFileSync(join(__dirname, 'assets', 'email-defaults', 'templates', `${name}.mjml`), 'utf-8').trim();
}

export class UpdateEmailTemplateBooleanVars1782700000000 implements MigrationInterface {
  name = 'UpdateEmailTemplateBooleanVars1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2, "subject" = $3 WHERE "type" = 'resource-health-changed'`,
      [
        readTemplate('resource-health-changed'),
        'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,health.status,health.previousStatus,health.reason,health.identifier,health.isDegraded,health.headerColor',
        'Resource health update: {{resource.name}}',
      ],
    );
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2 WHERE "type" = 'user-retraining-required'`,
      [
        readTemplate('user-retraining-required'),
        'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,retraining.isAge,retraining.isInactivity,retraining.blocksAccess',
      ],
    );
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2 WHERE "type" = 'resource-usage-note-added'`,
      [
        readTemplate('resource-usage-note-added'),
        'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,note.authorName,note.content,note.isStart',
      ],
    );
  }

  public async down(): Promise<void> {
    // no-op: restoring old bodyAction/phaseAction/retraining.reason vars would re-break the email service
  }
}
