import { AuditLog, SSOProviderType } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { ssoProviderAuditEvent } from '../users-and-auth/auth/sso/audit/provider-audit';
import { randomUUID } from 'node:crypto';
import { droppedRecords, setupAuditDatabase } from './audit.test-fixture';
import { billingTransactionAuditEvent } from './policies/billing';
import { AuditEvent } from './recorder/audit-event';
import { projectAuditRow } from './recorder/audit-row';

const actor = { id: 42, authenticationMethod: 'session' as const };

/** One valid envelope per core domain. */
const samples: Record<string, AuditEvent> = {
  administration: {
    domain: 'administration',
    action: 'email_layout.updated',
    actor,
    subject: { type: 'email-layout', id: 1 },
    details: {},
  },
  attractap: {
    domain: 'attractap',
    action: 'attractap.reader.deregistered',
    actor,
    subject: { type: 'attractap.reader', id: 3 },
    details: { source: 'admin-api' },
  },
  billing: billingTransactionAuditEvent({
    transactionId: 4,
    userId: 42,
    amount: -10,
    status: 'completed',
    source: 'resource-usage',
  }),
  identity: {
    domain: 'identity',
    action: 'identity.two_factor_enabled',
    operationId: randomUUID(),
    actor,
    subject: { type: 'identity.user', id: 42 },
    details: {},
  },
  project: {
    domain: 'project',
    action: 'project.deleted',
    actor,
    subject: { type: 'project', id: 6 },
    details: { 'before.name': 'Workshop' },
  },
  sso: ssoProviderAuditEvent('created', actor, {
    id: 8,
    name: 'Workshop IdP',
    type: SSOProviderType.OIDC,
    oidcConfiguration: {
      issuer: 'https://idp.example.test',
      authorizationURL: 'https://idp.example.test/authorize',
      tokenURL: 'https://idp.example.test/token',
      userInfoURL: 'https://idp.example.test/userinfo',
      clientId: 'workshop',
      clientSecret: 'secret',
      scopes: ['email'],
      roleMappings: null,
    },
  } as never),
  resource: {
    domain: 'resource',
    action: 'resource.deleted',
    actor,
    subject: { type: 'resource', id: 7 },
    details: { 'before.name': 'Lathe', 'before.type': 'machine' },
  },
};

describe('AuditRecorder', () => {
  const fixture = setupAuditDatabase();

  beforeEach(async () => {
    await fixture.store.setPlainSetting('audit', 'domains', JSON.stringify(Object.keys(samples)));
    await fixture.source.query('CREATE TABLE business_change (id integer PRIMARY KEY)');
  });

  const stored = () => fixture.source.getRepository(AuditLog).find();

  describe.each(Object.entries(samples))('%s in the caller transaction', (_domain, event) => {
    it('commits the row with the change', async () => {
      await fixture.source.transaction(async (manager) => {
        await manager.query('INSERT INTO business_change VALUES (1)');
        expect(await fixture.service.record(event, manager)).toEqual({ status: 'recorded' });
      });
      expect(await stored()).toHaveLength(1);
    });

    it('leaves no row when the change rolls back', async () => {
      await expect(
        fixture.source.transaction(async (manager) => {
          await manager.query('INSERT INTO business_change VALUES (1)');
          expect(await fixture.service.record(event, manager)).toEqual({ status: 'recorded' });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await stored()).toEqual([]);
      expect(await fixture.source.query('SELECT * FROM business_change')).toEqual([]);
    });
  });

  describe('row projection', () => {
    it('derives the stored pluginId from the domain', () => {
      const pluginIds = Object.fromEntries(
        Object.entries(samples).map(([domain, event]) => [domain, projectAuditRow(event)?.pluginId]),
      );
      expect(pluginIds).toEqual({
        administration: 'core',
        attractap: 'core',
        billing: 'billing',
        identity: null,
        project: 'core',
        resource: 'core',
        sso: null,
      });
    });

    // The per-domain methods defaulted an omitted method; a call site without strict null checks still omits it.
    it.each([
      ['resource', 'session'],
      ['project', 'session'],
      ['administration', 'session'],
      ['identity', null],
    ])('stores the former default for an omitted authentication method (%s)', (domain, expected) => {
      const event = { ...samples[domain], actor: { id: 42 } } as never;
      expect(projectAuditRow(event)?.authenticationMethod).toBe(expected);
    });

    it('stores no method for a resource change without an actor', () => {
      const event = { ...samples.resource, actor: { id: null } } as never;
      expect(projectAuditRow(event)).toMatchObject({ actorId: null, authenticationMethod: null });
    });

    it.each(['project', 'administration'])(
      'stores the session default for a %s actor that names no method, as the policy validated it',
      (domain) => {
        const event = { ...samples[domain], actor: { id: 42, authenticationMethod: null } } as AuditEvent;
        expect(projectAuditRow(event)).toMatchObject({ authenticationMethod: 'session', apiTokenId: null });
      },
    );

    it('keeps an omitted method invalid when an API token is named', () => {
      expect(projectAuditRow({ ...samples.resource, actor: { id: 42, apiTokenId: 3 } } as never)).toBeNull();
    });

    it('requires card events to name the card and every other attractap event its own subject', () => {
      const card = { ...samples.attractap, action: 'attractap.card.linked', details: { source: 'admin-api' } };
      expect(projectAuditRow({ ...card, subject: { type: 'attractap.card', id: 3 } } as never)).toMatchObject({
        subjectType: 'attractap.card',
      });
      expect(projectAuditRow({ ...card, subject: { type: 'attractap.reader', id: 3 } } as never)).toBeNull();
      expect(projectAuditRow({ ...samples.attractap, subject: { type: 'attractap.card', id: 3 } })).toBeNull();
    });

    it('rejects a non-success outcome for domains that record successful changes only', () => {
      expect(projectAuditRow({ ...samples.resource, outcome: 'failed' })).toBeNull();
      expect(projectAuditRow({ ...samples.identity, outcome: 'failed' })).toMatchObject({ outcome: 'failed' });
    });

    it('counts an envelope its domain policy rejects under that domain', async () => {
      expect(await fixture.service.record({ ...samples.project, details: { secret: 'x' } })).toEqual({
        status: 'unavailable',
      });
      expect(await droppedRecords(fixture.metrics)).toEqual({ 'project:invalid_event': 1 });
    });

    it('logs a rejected action only when it is a plain identifier', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        await fixture.service.record({ ...samples.project, action: 'project.deleted\nforged line' as never });
        await fixture.service.record({ ...samples.project, details: { secret: 'x' } });
        const lines = warn.mock.calls.map(([line]) => String(line));
        expect(lines).toEqual([
          'Audit record dropped: domain=project reason=invalid_event',
          'Audit record dropped: domain=project action=project.deleted reason=invalid_event',
        ]);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('the final settings change', () => {
    const disabling: AuditEvent = {
      domain: 'administration',
      action: 'settings.updated',
      actor,
      subject: { type: 'setting', id: 1 },
      details: { settingKey: 'audit.enabled', before: 'true', after: 'false' },
    };

    beforeEach(() => fixture.store.setPlainSetting('audit', 'enabled', 'false'));

    it('records the change that turned recording off when administration was recorded before', async () => {
      const previousAuditSettings = { enabled: true, domains: ['administration'] };
      expect(await fixture.service.record(disabling, undefined, { previousAuditSettings })).toEqual({
        status: 'recorded',
      });
      expect(await stored()).toHaveLength(1);
    });

    it('records nothing without the previous settings, or for another event', async () => {
      await fixture.service.record(disabling);
      await fixture.service.record(samples.administration, undefined, {
        previousAuditSettings: { enabled: true, domains: ['administration'] },
      });
      await fixture.service.record(disabling, undefined, {
        previousAuditSettings: { enabled: true, domains: ['resource'] },
      });
      expect(await stored()).toEqual([]);
      expect(await droppedRecords(fixture.metrics)).toEqual({});
    });
  });
});
