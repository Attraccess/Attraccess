import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Resource,
  ResourceType,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
  User,
  UserRole,
} from '@attraccess/database-entities';
import { SessionService } from '../../users-and-auth/auth/session.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { SettingsService } from '../../settings/settings.service';
import { ResourceEventsService } from '../../resources/sse/resource-events.service';

/** HTTP headers/initial SSE newline can arrive before the async allowed snapshot. */
export async function drainActivitySnapshot(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let snapshot = '';
  while (!snapshot.includes('"inUse"') || !snapshot.endsWith('\n\n')) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error('Stream ended before its allowed activity snapshot');
    snapshot += new TextDecoder().decode(chunk.value);
  }
}

export function registerStreamRevocation(get: () => { app: NestExpressApplication; db: DataSource; base: string }) {
  for (const transport of ['legacy', 'multiplexed']) {
    it.each(['permission', 'introduction', 'session', 'visibility'])(
      `${transport} stops private delivery after %s revocation`,
      async (change) => {
        const { app, db, base } = get();
        const restricted = change === 'introduction';
        await app
          .get(SettingsService)
          .updateAppSettings({ activityVisibility: restricted ? 'introduced-resources' : 'all-resources' });
        const user = await db
          .getRepository(User)
          .save({ username: randomUUID(), email: `${randomUUID()}@example.test`, isEmailVerified: true });
        await app.get(RbacService).assignDefaultRoles(user.id);
        const owner = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-admin' });
        const resource = await db.getRepository(Resource).save({ name: randomUUID(), type: ResourceType.Machine });
        const intro = await db
          .getRepository(ResourceIntroduction)
          .save({ resourceId: resource.id, receiverUserId: user.id, tutorUserId: owner.id });
        await db
          .getRepository(ResourceIntroductionHistoryItem)
          .save({ introductionId: intro.id, performedByUserId: owner.id, action: IntroductionHistoryAction.GRANT });
        const token = await app.get(SessionService).createSession(user);
        const id = randomUUID();
        const path = transport === 'legacy' ? `resources/${resource.id}/events` : `live-updates/${id}/events`;
        const abort = new AbortController();
        let text = '';
        const response = await fetch(`${base}/api/${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });
        expect(response.status).toBe(200);
        const reader = response.body.getReader();
        if (transport === 'multiplexed') {
          const update = await fetch(`${base}/api/live-updates/${id}/subscriptions`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              Origin: 'http://allowed.example',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ revision: 0, subscriptions: [{ topic: 'resource', resourceId: resource.id }] }),
          });
          expect(update.status).toBe(204);
        }
        await drainActivitySnapshot(reader);
        if (change === 'permission') await db.getRepository(UserRole).delete({ userId: user.id });
        if (change === 'introduction' || change === 'visibility')
          await db.getRepository(ResourceIntroduction).delete(intro.id);
        if (change === 'visibility')
          await app.get(SettingsService).updateAppSettings({ activityVisibility: 'introduced-resources' });
        if (change === 'session') await app.get(SessionService).revokeSession(token);
        const consume = (async () => {
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) return;
              text += new TextDecoder().decode(chunk.value);
            }
          } catch (error) {
            if (!abort.signal.aborted) throw error;
          }
        })();
        try {
          // Publish twice without waiting: queued callbacks must independently recheck authority.
          for (let n = 0; n < 2; n++)
            app
              .get(ResourceEventsService)
              .handleResourceUsage({ usage: { resource, user: { email: 'CONFIDENTIAL' } } } as never);
          await new Promise((resolve) => setTimeout(resolve, 150));
          abort.abort();
          await consume;
          expect(text).not.toContain('CONFIDENTIAL');
          expect(text).not.toContain('"inUse"');
        } finally {
          abort.abort();
          await app.get(SettingsService).updateAppSettings({ activityVisibility: 'all-resources' });
        }
      },
    );
  }
}
