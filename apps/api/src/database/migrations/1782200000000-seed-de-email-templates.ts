import { MigrationInterface, QueryRunner } from 'typeorm';

const MJML_HEAD = `
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button
        background-color="#2563EB"
        color="#FFFFFF"
        font-size="16px"
        font-weight="bold"
        padding="15px 30px"
        border-radius="4px"
        text-decoration="none"
      />
    </mj-attributes>
    <mj-style>
      a { color: inherit !important; text-decoration: none !important; }
    </mj-style>
  </mj-head>`;

const MJML_HEADER = `
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="24px" color="#1E40AF" font-weight="bold" padding="0">
          Attraccess
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0">
      <mj-column><mj-divider border-color="#E2E8F0" /></mj-column>
    </mj-section>`;

const MJML_FOOTER = `
    <mj-section padding="0">
      <mj-column><mj-divider border-color="#E2E8F0" /></mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center" padding="5px 0 0 0">
          Besuche uns:
          <a href="{{host.frontend}}">{{host.frontend}}</a> |
          <a href="https://github.com/Attraccess/Attraccess">GitHub</a>
        </mj-text>
      </mj-column>
    </mj-section>`;

const VERIFY_EMAIL_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          wir freuen uns, dich bei Attraccess willkommen zu heißen. Bitte bestätige deine E-Mail-Adresse, indem du auf den Button unten klickst:
        </mj-text>
        <mj-button href="{{url}}" align="center">
          E-Mail bestätigen
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
          <a href="{{url}}">{{url}}</a>
        </mj-text>
        <mj-text font-size="14px" color="#6B7280" padding="20px 0 0 0">
          Wenn du diese E-Mail nicht angefordert hast, kannst du sie einfach ignorieren.
        </mj-text>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const RESET_PASSWORD_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen. Klicke auf den Button unten, um fortzufahren:
        </mj-text>
        <mj-button href="{{url}}" align="center">
          Passwort zurücksetzen
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
          <a href="{{url}}">{{url}}</a>
        </mj-text>
        <mj-text font-size="14px" color="#6B7280" padding="20px 0 0 0">
          Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.
        </mj-text>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const USER_INVITATION_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          du wurdest eingeladen, Attraccess beizutreten. Klicke auf den Button unten, um die Einladung anzunehmen:
        </mj-text>
        <mj-button href="{{url}}" align="center">
          Einladung annehmen
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
          <a href="{{url}}">{{url}}</a>
        </mj-text>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const PASSWORD_CHANGED_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          dein Passwort wurde erfolgreich geändert. Falls du diese Änderung nicht vorgenommen hast, wende dich bitte umgehend an den Support.
        </mj-text>
        <mj-text font-size="14px" color="#6B7280" padding="10px 0 0 0">
          Wenn du diese Änderung selbst durchgeführt hast, musst du nichts weiter tun.
        </mj-text>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const USERNAME_CHANGED_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          dein Benutzername wurde von <strong>{{user.previousUsername}}</strong> zu <strong>{{user.newUsername}}</strong> geändert. Falls du diese Änderung nicht vorgenommen hast, kontaktiere bitte den Support.
        </mj-text>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const DELETE_ACCOUNT_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          wir haben eine Anfrage erhalten, dein Konto zu löschen. Klicke auf den Button unten, um die Löschung zu bestätigen:
        </mj-text>
        <mj-button href="{{url}}" align="center">
          Konto löschen
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
          <a href="{{url}}">{{url}}</a>
        </mj-text>
        <mj-text font-size="14px" color="#6B7280" padding="20px 0 0 0">
          Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren. Dein Konto bleibt unverändert.
        </mj-text>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const MESSAGE_RECEIVED_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          <strong>{{message.senderName}}</strong> hat dir eine Nachricht geschickt:
        </mj-text>
        <mj-text font-size="16px" color="#4B5563" padding="0 0 20px 0">
          {{message.preview}}
        </mj-text>
        <mj-button href="{{message.conversationUrl}}" align="center">
          Nachricht ansehen
        </mj-button>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const RESOURCE_HEALTH_CHANGED_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="{{health.headerColor}}" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="20px" color="#FFFFFF" font-weight="bold" padding="0">
          {{health.headline}}
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0">
      <mj-column><mj-divider border-color="#E2E8F0" /></mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          die Ressource <strong>{{resource.name}}</strong> {{health.bodyAction}}.
        </mj-text>
        {{#if health.reason}}
        <mj-text font-size="14px" color="#4B5563" padding="0 0 20px 0">
          Grund: {{health.reason}}
        </mj-text>
        {{/if}}
        <mj-button href="{{resource.url}}" align="center">
          Ressource ansehen
        </mj-button>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const USER_RETRAINING_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          für die Ressource <strong>{{resource.name}}</strong> ist eine erneute Einweisung erforderlich.
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          {{retraining.reason}}
        </mj-text>
        {{#if retraining.blocksAccess}}
        <mj-text font-size="14px" color="#B91C1C" padding="0 0 20px 0">
          Dein Zugang zu dieser Ressource ist gesperrt, bis die Einweisung abgeschlossen wurde.
        </mj-text>
        {{/if}}
        <mj-button href="{{resource.url}}" align="center">
          Ressource ansehen
        </mj-button>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const MAINTENANCE_REQUEST_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          für die Ressource <strong>{{resource.name}}</strong> wurde eine Wartungsanfrage von <strong>{{request.requestedBy}}</strong> gestellt.
        </mj-text>
        <mj-text font-size="16px" color="#4B5563" padding="0 0 20px 0">
          Grund: {{request.reason}}
        </mj-text>
        <mj-button href="{{resource.url}}" align="center">
          Ressource ansehen
        </mj-button>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const BILLING_SUMMARY_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#1E40AF" font-weight="bold" padding="0">
          Nutzungsbeleg
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0">
      <mj-column><mj-divider border-color="#E2E8F0" /></mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="10px 20px">
      <mj-column>
        <mj-text>Hallo {{user.username}},</mj-text>
        <mj-text>deine Sitzung an <strong>{{resource.name}}</strong> ist beendet. Hier ist dein Beleg:</mj-text>
        <mj-text>
          Start: {{usage.startTime}}<br/>
          Ende: {{usage.endTime}}<br/>
          Dauer: {{usage.roundedMinutes}} min
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="0 20px 20px 20px">
      <mj-column>
        <mj-table>
          <tr><th align="left">Posten</th><th align="right">Anz.</th><th align="right">Einheit</th><th align="right">Gesamt</th></tr>
          {{#each items}}
          <tr>
            <td>{{this.name}}</td>
            <td align="right">{{this.quantity}}</td>
            <td align="right">{{this.unitPrice}}</td>
            <td align="right">{{this.total}}</td>
          </tr>
          {{/each}}
          <tr>
            <td colspan="3" align="right"><strong>Gesamtkosten</strong></td>
            <td align="right"><strong>{{totalCredits}}</strong></td>
          </tr>
          <tr>
            <td colspan="3" align="right">Neues Guthaben</td>
            <td align="right">{{newBalance}}</td>
          </tr>
        </mj-table>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const PROJECT_INVITATION_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          <strong>{{inviter.username}}</strong> hat dich eingeladen, dem Projekt <strong>{{project.name}}</strong> beizutreten.
        </mj-text>
        <mj-button href="{{invitationUrl}}" align="center">
          Einladung ansehen
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
          <a href="{{invitationUrl}}">{{invitationUrl}}</a>
        </mj-text>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

const RESOURCE_USAGE_NOTE_DE = `<mjml>${MJML_HEAD}
  <mj-body background-color="#F3F7FB" width="600px">${MJML_HEADER}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hallo {{user.username}},
        </mj-text>
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          beim {{note.phaseAction}} deiner Sitzung an der Ressource <strong>{{resource.name}}</strong> hat <strong>{{note.authorName}}</strong> folgende Notiz hinterlassen:
        </mj-text>
        <mj-text font-size="16px" color="#4B5563" padding="0 0 20px 0">
          {{note.content}}
        </mj-text>
        <mj-button href="{{resource.url}}" align="center">
          Ressource ansehen
        </mj-button>
      </mj-column>
    </mj-section>${MJML_FOOTER}
  </mj-body>
</mjml>`;

export class SeedDeEmailTemplates1782200000000 implements MigrationInterface {
  name = 'SeedDeEmailTemplates1782200000000';

  private readonly templates = [
    { type: 'verify-email', subject: 'E-Mail-Adresse bestätigen', body: VERIFY_EMAIL_DE },
    { type: 'reset-password', subject: 'Passwort zurücksetzen', body: RESET_PASSWORD_DE },
    { type: 'user-invitation', subject: 'Du wurdest zu Attraccess eingeladen!', body: USER_INVITATION_DE },
    { type: 'password-changed', subject: 'Dein Passwort wurde geändert', body: PASSWORD_CHANGED_DE },
    { type: 'username-changed', subject: 'Dein Benutzername wurde geändert', body: USERNAME_CHANGED_DE },
    { type: 'delete-account-confirmation', subject: 'Kontolöschung bestätigen', body: DELETE_ACCOUNT_DE },
    { type: 'message-received', subject: 'Du hast eine neue Nachricht', body: MESSAGE_RECEIVED_DE },
    { type: 'resource-health-changed', subject: '{{health.headline}}', body: RESOURCE_HEALTH_CHANGED_DE },
    { type: 'user-retraining-required', subject: 'Erneute Einweisung erforderlich: {{resource.name}}', body: USER_RETRAINING_DE },
    { type: 'maintenance-request-created', subject: 'Neue Wartungsanfrage: {{resource.name}}', body: MAINTENANCE_REQUEST_DE },
    { type: 'resource-usage-note-added', subject: 'Notiz zu deiner Sitzung an {{resource.name}}', body: RESOURCE_USAGE_NOTE_DE },
    { type: 'resource-usage-billing-transaction-summary', subject: 'Dein Nutzungsbeleg für {{resource.name}}', body: BILLING_SUMMARY_DE },
    { type: 'project-invitation', subject: 'Du wurdest zu einem Projekt eingeladen', body: PROJECT_INVITATION_DE },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tpl of this.templates) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "email_templates" ("type", "locale", "subject", "body", "variables") VALUES ($1, $2, $3, $4, '')`,
        [tpl.type, 'de', tpl.subject, tpl.body],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "locale" = 'de'`);
  }
}
