import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectInvitationRole1763933042954 implements MigrationInterface {
  name = 'ProjectInvitationRole1763933042954';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('project_invitations', 'requestedRole');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "project_invitations" ADD COLUMN "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer')`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('project_invitations', 'requestedRole');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "project_invitations" DROP COLUMN "requestedRole"`);
    }
  }
}
