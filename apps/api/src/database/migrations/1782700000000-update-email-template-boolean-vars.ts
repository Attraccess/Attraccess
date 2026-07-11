import { MigrationInterface, QueryRunner } from 'typeorm';

const RESOURCE_HEALTH_CHANGED_BODY = `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.username}}</mj-text>
    <mj-text padding="0 0 12px 0">
      {{#if health.isDegraded}}
        {{t 'body_degraded' 'Resource <strong>{resource}</strong> has become degraded.' resource=resource.name}}
      {{else}}
        {{t 'body_recovered' 'Resource <strong>{resource}</strong> is healthy again.' resource=resource.name}}
      {{/if}}
    </mj-text>
    {{#if health.identifier}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 4px 0">{{t 'subsystem_label' 'Subsystem: <strong>{subsystem}</strong>' subsystem=health.identifier}}</mj-text>
    {{/if}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'previous_status' 'Previous status: <strong>{status}</strong>' status=health.previousStatus}}<br/>
      {{t 'new_status' 'New status: <strong>{status}</strong>' status=health.status}}
    </mj-text>
    {{#if health.reason}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">{{t 'reason_label' 'Reason: {reason}' reason=health.reason}}</mj-text>
    {{/if}}
    <mj-button href="{{resource.url}}" align="center">{{t 'button' 'Open Resource'}}</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      {{t 'copy_link' 'Or copy this link into your browser:<br /><a href="{url}">{url}</a>' url=resource.url}}
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      {{t 'footer' 'You received this email because you can manage this resource.'}}
    </mj-text>
  </mj-column>
</mj-section>`;

const RESOURCE_HEALTH_CHANGED_VARS =
  'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,health.status,health.previousStatus,health.reason,health.identifier,health.isDegraded,health.headerColor';

const USER_RETRAINING_REQUIRED_BODY = `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.username}}</mj-text>
    <mj-text padding="0 0 12px 0">
      {{t 'body' 'Your training for <strong>{resource}</strong> is due for renewal.' resource=resource.name}}
    </mj-text>
    {{#if retraining.isAge}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'reason_age' 'Your training has reached its maximum age and must be renewed.'}}
    </mj-text>
    {{else if retraining.isInactivity}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'reason_inactivity' 'You have not used this resource for the configured period and must be retrained.'}}
    </mj-text>
    {{else}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'reason_default' 'Your training must be renewed.'}}
    </mj-text>
    {{/if}}
    {{#if retraining.blocksAccess}}
    <mj-text font-size="14px" color="#DC2626" padding="0 0 12px 0">
      {{t 'blocks_access' 'Access to this resource is blocked until you have been retrained by an introducer.'}}
    </mj-text>
    {{/if}}
    <mj-button href="{{resource.url}}" align="center">{{t 'button' 'Open Resource'}}</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      {{t 'copy_link' 'Or copy this link into your browser:<br /><a href="{url}">{url}</a>' url=resource.url}}
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      {{t 'footer' 'You received this email because your training for this resource requires renewal.'}}
    </mj-text>
  </mj-column>
</mj-section>`;

const USER_RETRAINING_REQUIRED_VARS =
  'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,retraining.isAge,retraining.isInactivity,retraining.blocksAccess';

const RESOURCE_USAGE_NOTE_ADDED_BODY = `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.username}}</mj-text>
    <mj-text padding="0 0 12px 0">
      {{#if note.isStart}}
        {{t 'body_start' '<strong>{author}</strong> left a note when starting <strong>{resource}</strong>.' author=note.authorName resource=resource.name}}
      {{else}}
        {{t 'body_end' '<strong>{author}</strong> left a note when finishing <strong>{resource}</strong>.' author=note.authorName resource=resource.name}}
      {{/if}}
    </mj-text>
    <mj-text font-size="14px" color="#111827" padding="12px" container-background-color="#F8FAFC">
      {{note.content}}
    </mj-text>
    <mj-button href="{{resource.url}}" align="center">{{t 'button' 'View Resource'}}</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      {{t 'copy_link' 'Or copy this link into your browser:<br /><a href="{url}">{url}</a>' url=resource.url}}
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      {{t 'footer' 'You received this email because you are an introducer, maintainer or administrator for this resource.'}}
    </mj-text>
  </mj-column>
</mj-section>`;

const RESOURCE_USAGE_NOTE_ADDED_VARS =
  'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,note.authorName,note.content,note.isStart';

export class UpdateEmailTemplateBooleanVars1782700000000 implements MigrationInterface {
  name = 'UpdateEmailTemplateBooleanVars1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2, "subject" = $3 WHERE "type" = 'resource-health-changed'`,
      [RESOURCE_HEALTH_CHANGED_BODY, RESOURCE_HEALTH_CHANGED_VARS, 'Resource health update: {{resource.name}}'],
    );
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2 WHERE "type" = 'user-retraining-required'`,
      [USER_RETRAINING_REQUIRED_BODY, USER_RETRAINING_REQUIRED_VARS],
    );
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2 WHERE "type" = 'resource-usage-note-added'`,
      [RESOURCE_USAGE_NOTE_ADDED_BODY, RESOURCE_USAGE_NOTE_ADDED_VARS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ponytail: no down — restoring old bodyAction/phaseAction/retraining.reason vars would re-break the email service
  }
}
