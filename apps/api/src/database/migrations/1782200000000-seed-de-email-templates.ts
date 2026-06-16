import { MigrationInterface, QueryRunner } from 'typeorm';

// Updated resource-health-changed template using the {{t}} Handlebars helper
// for locale-aware strings rather than pre-computed context variables.
const RESOURCE_HEALTH_CHANGED_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="{{health.headerColor}}" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          {{#if health.isDegraded}}{{t "health.degraded.headline" "Resource Health Degraded"}}{{else}}{{t "health.recovered.headline" "Resource Health Recovered"}}{{/if}}: {{resource.name}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>{{t "greeting" "Hello"}} {{user.username}},</mj-text>
        <mj-text>
          {{t "resource.label" "Resource"}} <strong>{{resource.name}}</strong> {{#if health.isDegraded}}{{t "health.degraded.action" "has become degraded"}}{{else}}{{t "health.recovered.action" "is healthy again"}}{{/if}}.
        </mj-text>
        {{#if health.identifier}}
        <mj-text>{{t "health.subsystem.label" "Subsystem"}}: <strong>{{health.identifier}}</strong></mj-text>
        {{/if}}
        <mj-text>
          {{t "health.previousStatus.label" "Previous status"}}: <strong>{{health.previousStatus}}</strong><br/>
          {{t "health.newStatus.label" "New status"}}: <strong>{{health.status}}</strong>
        </mj-text>
        {{#if health.reason}}
        <mj-text>{{t "health.reason.label" "Reason"}}: {{health.reason}}</mj-text>
        {{/if}}
        <mj-button href="{{resource.url}}" align="left">
          {{t "health.cta" "Open Resource"}}
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          {{t "fallbackLink.hint" "If the button does not work, paste this into your browser:"}}
          <br />
          <a href="{{resource.url}}">{{resource.url}}</a>
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="0 20px 20px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center">
          {{t "health.footer" "You received this email because you can manage this resource."}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const RESOURCE_HEALTH_CHANGED_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'health.status',
  'health.previousStatus',
  'health.reason',
  'health.identifier',
  'health.isDegraded',
  'health.headerColor',
].join(',');

const USER_RETRAINING_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#B45309" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          {{t "retraining.headline" "Retraining required"}}: {{resource.name}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>{{t "greeting" "Hello"}} {{user.username}},</mj-text>
        <mj-text>
          {{t "retraining.intro" "Your training for"}} <strong>{{resource.name}}</strong> {{t "retraining.intro2" "is due for renewal."}}
        </mj-text>
        <mj-text>
          {{t "retraining.reason.label" "Reason"}}:
          {{#if retraining.isAge}}{{t "retraining.reason.age" "Your training has reached its maximum age and must be renewed."}}{{else if retraining.isInactivity}}{{t "retraining.reason.inactivity" "You have not used this resource for the configured period and must be retrained."}}{{else}}{{t "retraining.reason.default" "Your training must be renewed."}}{{/if}}
        </mj-text>
        {{#if retraining.blocksAccess}}
        <mj-text>
          {{t "retraining.blocksAccess" "Access to this resource is blocked until you have been retrained by an introducer."}}
        </mj-text>
        {{/if}}
        <mj-button href="{{resource.url}}" align="left">
          {{t "retraining.cta" "Open Resource"}}
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          {{t "fallbackLink.hint" "If the button does not work, paste this into your browser:"}}
          <br />
          <a href="{{resource.url}}">{{resource.url}}</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const USER_RETRAINING_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'retraining.isAge',
  'retraining.isInactivity',
  'retraining.blocksAccess',
].join(',');

const RESOURCE_USAGE_NOTE_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#2563EB" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          {{t "usageNote.headline" "New usage note"}}: {{resource.name}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>{{t "greeting" "Hello"}} {{user.username}},</mj-text>
        <mj-text>
          <strong>{{note.authorName}}</strong> {{t "usageNote.action" "left a note when"}} {{#if note.isStart}}{{t "usageNote.phase.start" "starting"}}{{else}}{{t "usageNote.phase.end" "finishing"}}{{/if}} <strong>{{resource.name}}</strong>.
        </mj-text>
        <mj-text font-size="14px" color="#111827" background-color="#F3F4F6" padding="12px" border-radius="4px">
          {{note.content}}
        </mj-text>
        <mj-button href="{{resource.url}}" align="left">
          {{t "usageNote.cta" "View Resource"}}
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          {{t "fallbackLink.hint" "If the button does not work, paste this into your browser:"}}
          <br />
          <a href="{{resource.url}}">{{resource.url}}</a>
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="0 20px 20px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center">
          {{t "usageNote.footer" "You received this email because you are an introducer, maintainer or administrator for this resource."}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const RESOURCE_USAGE_NOTE_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'note.authorName',
  'note.content',
  'note.isStart',
].join(',');

type TranslationRow = { templateType: string; key: string; value: string };

const DE_TRANSLATIONS: TranslationRow[] = [
  // resource-health-changed
  { templateType: 'resource-health-changed', key: 'greeting', value: 'Hallo' },
  { templateType: 'resource-health-changed', key: 'resource.label', value: 'Die Ressource' },
  { templateType: 'resource-health-changed', key: 'health.degraded.headline', value: 'Ressourcenproblem' },
  { templateType: 'resource-health-changed', key: 'health.recovered.headline', value: 'Ressource erholt' },
  { templateType: 'resource-health-changed', key: 'health.degraded.action', value: 'ist nicht mehr verfügbar' },
  { templateType: 'resource-health-changed', key: 'health.recovered.action', value: 'ist wieder verfügbar' },
  { templateType: 'resource-health-changed', key: 'health.subsystem.label', value: 'Teilsystem' },
  { templateType: 'resource-health-changed', key: 'health.previousStatus.label', value: 'Vorheriger Status' },
  { templateType: 'resource-health-changed', key: 'health.newStatus.label', value: 'Neuer Status' },
  { templateType: 'resource-health-changed', key: 'health.reason.label', value: 'Grund' },
  { templateType: 'resource-health-changed', key: 'health.cta', value: 'Ressource öffnen' },
  { templateType: 'resource-health-changed', key: 'fallbackLink.hint', value: 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:' },
  { templateType: 'resource-health-changed', key: 'health.footer', value: 'Du erhältst diese E-Mail, weil du diese Ressource verwalten kannst.' },
  // user-retraining-required
  { templateType: 'user-retraining-required', key: 'greeting', value: 'Hallo' },
  { templateType: 'user-retraining-required', key: 'retraining.headline', value: 'Erneute Einweisung erforderlich' },
  { templateType: 'user-retraining-required', key: 'retraining.intro', value: 'Deine Einweisung für' },
  { templateType: 'user-retraining-required', key: 'retraining.intro2', value: 'muss erneuert werden.' },
  { templateType: 'user-retraining-required', key: 'retraining.reason.label', value: 'Grund' },
  { templateType: 'user-retraining-required', key: 'retraining.reason.age', value: 'Deine Einweisung hat ihr Maximalalter erreicht und muss erneuert werden.' },
  { templateType: 'user-retraining-required', key: 'retraining.reason.inactivity', value: 'Du hast diese Ressource für den konfigurierten Zeitraum nicht genutzt und musst erneut eingewiesen werden.' },
  { templateType: 'user-retraining-required', key: 'retraining.reason.default', value: 'Deine Einweisung muss erneuert werden.' },
  { templateType: 'user-retraining-required', key: 'retraining.blocksAccess', value: 'Dein Zugang zu dieser Ressource ist gesperrt, bis du erneut eingewiesen wurdest.' },
  { templateType: 'user-retraining-required', key: 'retraining.cta', value: 'Ressource öffnen' },
  { templateType: 'user-retraining-required', key: 'fallbackLink.hint', value: 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:' },
  // resource-usage-note-added
  { templateType: 'resource-usage-note-added', key: 'greeting', value: 'Hallo' },
  { templateType: 'resource-usage-note-added', key: 'usageNote.headline', value: 'Neue Nutzungsnotiz' },
  { templateType: 'resource-usage-note-added', key: 'usageNote.action', value: 'hat eine Notiz hinterlassen beim' },
  { templateType: 'resource-usage-note-added', key: 'usageNote.phase.start', value: 'Starten von' },
  { templateType: 'resource-usage-note-added', key: 'usageNote.phase.end', value: 'Beenden von' },
  { templateType: 'resource-usage-note-added', key: 'usageNote.cta', value: 'Ressource ansehen' },
  { templateType: 'resource-usage-note-added', key: 'fallbackLink.hint', value: 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:' },
  { templateType: 'resource-usage-note-added', key: 'usageNote.footer', value: 'Du erhältst diese E-Mail, weil du Einweiser, Betreuer oder Administrator für diese Ressource bist.' },
];

export class UpdateTemplatesToUseTHelper1782200000000 implements MigrationInterface {
  name = 'UpdateTemplatesToUseTHelper1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update the 3 templates that previously relied on JS-computed translated strings
    await queryRunner.query(
      `UPDATE "email_templates" SET "subject" = $1, "body" = $2, "variables" = $3 WHERE "type" = 'resource-health-changed'`,
      [
        '{{#if health.isDegraded}}{{t "health.degraded.headline" "Resource Health Degraded"}}{{else}}{{t "health.recovered.headline" "Resource Health Recovered"}}{{/if}}: {{resource.name}}',
        RESOURCE_HEALTH_CHANGED_MJML,
        RESOURCE_HEALTH_CHANGED_VARIABLES,
      ],
    );

    await queryRunner.query(
      `UPDATE "email_templates" SET "subject" = $1, "body" = $2, "variables" = $3 WHERE "type" = 'user-retraining-required'`,
      [
        '{{t "retraining.headline" "Retraining required"}}: {{resource.name}}',
        USER_RETRAINING_MJML,
        USER_RETRAINING_VARIABLES,
      ],
    );

    await queryRunner.query(
      `UPDATE "email_templates" SET "subject" = $1, "body" = $2, "variables" = $3 WHERE "type" = 'resource-usage-note-added'`,
      [
        '{{t "usageNote.headline" "New usage note"}}: {{resource.name}}',
        RESOURCE_USAGE_NOTE_MJML,
        RESOURCE_USAGE_NOTE_VARIABLES,
      ],
    );

    // Seed DE translations
    for (const row of DE_TRANSLATIONS) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES ($1, $2, $3, $4)`,
        [row.templateType, row.key, 'de', row.value],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_template_translations" WHERE "locale" = 'de'`);
  }
}
