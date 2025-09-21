import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingTransactionItems1757949704265 implements MigrationInterface {
  name = 'BillingTransactionItems1757949704265';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "billing_transaction_item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "billingTransactionId" integer NOT NULL, "name" varchar NOT NULL, "description" varchar, "externalReference" varchar, "value" integer NOT NULL, CONSTRAINT "FK_2455de178cbdab7028200076b03" FOREIGN KEY ("billingTransactionId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "billing_transaction_item"`);
  }
}
