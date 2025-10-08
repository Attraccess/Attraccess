import { MigrationInterface, QueryRunner } from 'typeorm';

const BILLING_SUMMARY_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#1E40AF" font-weight="bold" padding="0">
          Usage Session Receipt
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="10px 20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>Your session on <strong>{{resource.name}}</strong> has ended. Here is your receipt:</mj-text>
        <mj-text>
          Start: {{usage.startTime}}<br/>
          End: {{usage.endTime}}<br/>
          Duration: {{usage.roundedMinutes}} min
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="0 20px 20px 20px">
      <mj-column>
        <mj-table>
          <tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Unit</th><th align="right">Total</th></tr>
          {{#each items}}
          <tr>
            <td>{{this.name}}</td>
            <td align="right">{{this.quantity}}</td>
            <td align="right">{{this.unitPrice}}</td>
            <td align="right">{{this.total}}</td>
          </tr>
          {{/each}}
          <tr>
            <td colspan="3" align="right"><strong>Discount</strong></td>
            <td align="right">{{discount}}</td>
          </tr>
          <tr>
            <td colspan="3" align="right"><strong>Total Credits</strong></td>
            <td align="right"><strong>{{totalCredits}}</strong></td>
          </tr>
          <tr>
            <td colspan="3" align="right">New Balance</td>
            <td align="right">{{newBalance}}</td>
          </tr>
        </mj-table>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

export class SeedBillingTransactionSummaryTemplate1759800000100 implements MigrationInterface {
  name = 'SeedBillingTransactionSummaryTemplate1759800000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'resource-usage-billing-transaction-summary',
        'Your usage receipt for {{resource.name}}',
        BILLING_SUMMARY_MJML,
        JSON.stringify([
          'user.username',
          'user.email',
          'host.frontend',
          'host.backend',
          'usage.startTime',
          'usage.endTime',
          'usage.roundedMinutes',
          'items[].name',
          'items[].quantity',
          'items[].unitPrice',
          'items[].total',
          'discount',
          'totalCredits',
          'newBalance',
        ]),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "email_templates" WHERE "type" = 'resource-usage-billing-transaction-summary'`,
    );
  }
}
