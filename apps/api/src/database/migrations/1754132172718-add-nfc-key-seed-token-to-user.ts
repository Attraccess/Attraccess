import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNfcKeySeedTokenToUser1754132172718 implements MigrationInterface {
    name = 'AddNfcKeySeedTokenToUser1754132172718'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "nfcKeySeedToken" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "nfcKeySeedToken"`);
    }
}