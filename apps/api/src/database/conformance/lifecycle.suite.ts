import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { UserRoleSource } from '@attraccess/application-models';
import { IdentityFixture, IdentityFixtureFactory } from './backend-fixture';

/** Reuse unchanged with another real engine by supplying its application/fixture composition. */
export function identityLifecycleConformance(name: string, factory: IdentityFixtureFactory): void {
  describe(`${name}: atomic identity creation`, () => {
    let fixture: IdentityFixture;
    beforeEach(async () => {
      fixture = await factory();
    });
    afterEach(async () => {
      await fixture?.close();
    });

    it('preserves invitation rollback without replaying SMTP after a delivery failure', async () => {
      const input = { username: 'invitation.user', email: 'invitation@example.test' };
      fixture.failInvitationDelivery(true);
      await expect(fixture.inviteIdentity(input)).rejects.toThrow();
      expect(fixture.invitationDeliveryAttempts()).toBe(1);
      await expect(fixture.identitySnapshot()).resolves.toEqual({ users: [], grants: [], authentication: [] });
      fixture.failInvitationDelivery(false);
      const user = await fixture.inviteIdentity(input);
      expect(fixture.invitationDeliveryAttempts()).toBe(2);
      const snapshot = await fixture.identitySnapshot();
      expect(snapshot.users).toHaveLength(1);
      expect(snapshot.grants).toHaveLength(1);
      expect(snapshot.grants[0].userId).toBe(user.id);
      expect(snapshot.users[0].emailVerificationToken).toMatch(/^stored:/);
    });

    it.each(['role', 'credential'] as const)(
      'rolls back account and related records when the %s write fails',
      async (stage) => {
        const input = {
          username: 'conformance.user',
          email: 'conformance@example.test',
          passwordHash: 'retained-password-hash',
        };
        await fixture.rejectIdentityWrite(stage);
        await expect(fixture.registerIdentity(input)).rejects.toThrow('identity write rejected');
        await expect(fixture.identitySnapshot()).resolves.toEqual({ users: [], grants: [], authentication: [] });
        await fixture.rejectIdentityWrite(null);
        const result = await fixture.registerIdentity(input);
        const snapshot = await fixture.identitySnapshot();
        expect(snapshot.users).toHaveLength(1);
        expect(snapshot.grants).toHaveLength(1);
        expect(snapshot.authentication).toHaveLength(1);
        expect(snapshot.grants[0]).toMatchObject({ userId: result.user.id, source: UserRoleSource.MANUAL });
        expect(snapshot.authentication[0]).toMatchObject({ userId: result.user.id, password: input.passwordHash });
        expect(snapshot.users[0].email).toBe(input.email);
        expect(Object.getPrototypeOf(result.user)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(result.authentication)).toBe(Object.prototype);
        expect(result.user.createdAt).toBeInstanceOf(Date);
      },
    );
  });
}

import { ApplicationFixture, ApplicationFixtureFactory, ApplicationClient } from './backend-fixture';
import { overlap } from './accounting.suite';
export function usageLifecycleConformance(name: string, factory: ApplicationFixtureFactory) {
  describe(`${name}: application lifecycle with real ledger and migrations`, () => {
    let fixture: ApplicationFixture;
    let a: ApplicationClient;
    let b: ApplicationClient;
    beforeEach(async () => {
      fixture = await factory();
      a = await fixture.client();
      b = await fixture.client();
    });
    afterEach(async () => {
      await fixture?.close();
    });
    it('allows only one overlapping reservation, then only one finalization and charge', async () => {
      const starts = await overlap(
        a,
        b,
        () => a.start(1, 1),
        () => b.start(1, 1),
      );
      expect(starts.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      expect(a.effectCount() + b.effectCount()).toBe(1);
      expect((await a.snapshot()).usages.filter((row) => row.endTime === null && row.isFinalized)).toHaveLength(1);
      const ends = await overlap(
        a,
        b,
        () => a.end(1, 1),
        () => b.end(1, 1),
      );
      expect(ends.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      const snapshot = await a.snapshot();
      expect(snapshot.balances).toEqual([93, 100]);
      expect(snapshot.usages).toHaveLength(1);
      expect(snapshot.usages[0].endTime).toBeInstanceOf(Date);
      expect(snapshot.attempts).toBe(0);
      expect(a.effectCount() + b.effectCount()).toBe(2);
      expect(await fixture.integrityViolations()).toEqual([]);
    });
    it('rolls back failed publication after a device command without replaying it or notifying', async () => {
      await fixture.rejectPublication(true);
      await expect(a.start(1, 1)).rejects.toThrow('publication rejected');
      const snapshot = await a.snapshot();
      expect(snapshot.balances).toEqual([100, 100]);
      expect(snapshot.attempts).toBe(0);
      expect(snapshot.usages.filter((row) => row.endTime === null)).toEqual([]);
      expect(snapshot.ledger).toHaveLength(2);
      expect(snapshot.audit).toEqual([]);
      expect(a.effectCount()).toBe(1);
      expect(a.notificationCount()).toBe(0);
    });
    it.each(['end', 'takeover'] as const)(
      'preserves the outgoing session and balance on failed %s effect',
      async (kind) => {
        const original = await a.start(1, 1);
        const before = await a.snapshot();
        const notifications = a.notificationCount();
        a.failEffect(true);
        await expect(kind === 'end' ? a.end(1, 1) : a.start(1, 2, true)).rejects.toThrow();
        const after = await a.snapshot();
        expect(after.balances).toEqual(before.balances);
        expect(after.ledger).toEqual(before.ledger);
        expect(after.audit).toEqual(before.audit);
        expect(after.usages.find((row) => row.id === original.id)?.endTime).toBeNull();
        expect(after.attempts).toBe(0);
        expect(a.notificationCount()).toBe(notifications);
        expect(a.effectCount()).toBe(2);
      },
    );
    it.each(['end', 'takeover'] as const)(
      'rolls back a failed %s database phase after the device effect',
      async (kind) => {
        const original = await a.start(1, 1);
        const before = await a.snapshot();
        const notifications = a.notificationCount();
        await fixture.rejectPublication(true);
        await expect(kind === 'end' ? a.end(1, 1) : a.start(1, 2, true)).rejects.toThrow('publication rejected');
        const after = await a.snapshot();
        expect(after.balances).toEqual(before.balances);
        expect(after.ledger).toEqual(before.ledger);
        expect(after.audit).toEqual(before.audit);
        expect(after.usages).toEqual(before.usages);
        expect(after.usages[0].id).toBe(original.id);
        expect(after.attempts).toBe(0);
        expect(a.effectCount()).toBe(2);
        expect(a.notificationCount()).toBe(notifications);
      },
    );
    it('recovers an interrupted attempt after a device command without invoking the device again', async () => {
      const gate = a.gateNextEffect();
      const result = a.start(1, 1);
      const settled = result.catch((error) => error);
      await gate.entered;
      expect((await b.snapshot()).attempts).toBe(1);
      try {
        await b.recover();
      } finally {
        gate.release();
      }
      expect(await settled).toBeInstanceOf(Error);
      const snapshot = await b.snapshot();
      expect(snapshot.attempts).toBe(0);
      expect(snapshot.balances).toEqual([100, 100]);
      expect(snapshot.usages.filter((row) => row.endTime === null)).toEqual([]);
      expect(a.effectCount() + b.effectCount()).toBe(1);
      expect(snapshot.audit).toEqual([]);
    });
  });
}
