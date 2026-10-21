import { ApiTokenService } from '../../users-and-auth/auth/api-token/api-token.service';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Role,
  RolePermission,
  Resource,
  ResourceType,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
  ResourceIntroducer,
  ResourceIntroducerType,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';
import { SettingsService } from '../../settings/settings.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { SessionService } from '../../users-and-auth/auth/session.service';

export function registerActivityVisibility(get: () => { app: NestExpressApplication; db: DataSource }) {
  it('applies both visibility settings to real direct, group, inherited, revoked and retraining records', async () => {
    const { app, db } = get();
    const user = await db
      .getRepository(User)
      .save({ username: randomUUID(), email: `${randomUUID()}@example.test`, isEmailVerified: true });
    await app.get(RbacService).assignDefaultRoles(user.id);
    const role = await db
      .getRepository(Role)
      .save({ key: 'visibility-token-owner', name: 'Token owner', description: 'Test token management only' });
    await db.getRepository(RolePermission).save({ roleId: role.id, permissionKey: 'users.api-tokens.manage' });
    await app.get(RbacService).assignRoleByKey(user.id, role.key);
    const owner = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-admin' });
    const token = await app.get(SessionService).createSession(user);
    const getPath = (path: string) =>
      request(app.getHttpServer()).get(`/api/${path}`).set('Authorization', `Bearer ${token}`);
    const cases: { id: number; visible: boolean }[] = [];
    for (const kind of ['direct', 'group', 'inherited-introducer', 'revoked', 'retraining', 'none']) {
      const group = await db.getRepository(ResourceGroup).save({ name: `Visibility ${kind}` });
      const resource = await db.getRepository(Resource).save({
        name: `Visibility ${kind}`,
        type: ResourceType.Machine,
        groups: [group],
        retrainingBlocksAccess: kind === 'retraining',
        retrainingMaxAgeDays: kind === 'retraining' ? 1 : null,
      });
      await db.getRepository(ResourceUsage).save({
        resourceId: resource.id,
        userId: user.id,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        isFinalized: true,
      });
      if (kind === 'inherited-introducer')
        await db
          .getRepository(ResourceIntroducer)
          .save({ resourceGroupId: group.id, userId: user.id, type: ResourceIntroducerType.INTRODUCER });
      else if (kind !== 'none') {
        const intro = await db.getRepository(ResourceIntroduction).save({
          resourceId: kind === 'group' ? null : resource.id,
          resourceGroupId: kind === 'group' ? group.id : null,
          receiverUserId: user.id,
          tutorUserId: owner.id,
          completedAt: new Date(Date.now() - (kind === 'retraining' ? 5 : 0) * 86400000),
        });
        await db.getRepository(ResourceIntroductionHistoryItem).save({
          introductionId: intro.id,
          performedByUserId: owner.id,
          action: kind === 'revoked' ? IntroductionHistoryAction.REVOKE : IntroductionHistoryAction.GRANT,
          createdAt: new Date(Date.now() - (kind === 'retraining' ? 5 : 0) * 86400000),
        });
      }
      cases.push({ id: resource.id, visible: ['direct', 'group', 'inherited-introducer'].includes(kind) });
    }
    try {
      for (const mode of ['all-resources', 'introduced-resources'] as const) {
        await app.get(SettingsService).updateAppSettings({ activityVisibility: mode });
        const expected = cases.filter((item) => mode === 'all-resources' || item.visible).map((item) => item.id);
        const inUse = await getPath('resources/in-use').expect(200);
        expect(
          inUse.body
            .filter((item: Resource) => cases.some((entry) => entry.id === item.id))
            .map((item: Resource) => item.id)
            .sort(),
        ).toEqual(expected.sort());
        const page = await getPath('resources?onlyInUseByMe=true&limit=100').expect(200);
        expect(page.body.total).toBe(expected.length);
        if (mode === 'introduced-resources') {
          const tokens = app.get(ApiTokenService);
          const denied = await tokens.create(user.id, { name: 'no activity scope', permissionKeys: [] });
          const scoped = await tokens.create(user.id, { name: 'activity scope', permissionKeys: ['resources.read'] });
          for (const item of cases.filter((entry) => entry.visible)) {
            for (const [credential, status] of [
              [denied.token, 403],
              [scoped.token, 200],
            ] as const) {
              await request(app.getHttpServer())
                .get(`/api/resources/${item.id}/usage/active`)
                .set('Authorization', `Bearer ${credential}`)
                .expect(status);
            }
          }
        }

        for (const item of cases) {
          const allowed = expected.includes(item.id);
          await getPath(`resources/${item.id}/usage/active`).expect(allowed ? 200 : 403);
          await getPath(`resources/${item.id}/health`).expect(allowed ? 200 : 403);
          const detail = await getPath(`resources/${item.id}`).expect(200);
          if (!allowed)
            for (const field of ['usages', 'introductions', 'introducers'])
              expect(detail.body).not.toHaveProperty(field);
        }
      }
    } finally {
      await app.get(SettingsService).updateAppSettings({ activityVisibility: 'all-resources' });
      for (const item of cases) await db.getRepository(ResourceUsage).delete({ resourceId: item.id });
    }
  });
}
