import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CardKind } from '../card-crypto/card-operations';
import { AuditPrincipal } from './card-operations.service';
import { createRelayReader, createServices, detect } from './card-relay.test-fixture';

/** The audit trail of card enrollments and resets done through a relaying reader. */
describe.each<CardKind>(['desfire', 'ntag424'])('card audit records (%s)', (kind) => {
  const session: AuditPrincipal = { userId: 1, authenticationMethod: 'session' };
  const apiToken: AuditPrincipal = { userId: 99, authenticationMethod: 'api-token', apiTokenId: 12 };

  async function enrolledBy(auditPrincipal: AuditPrincipal) {
    const services = createServices();
    const card = new EmulatedCard(kind);
    const reader = createRelayReader(card, services.conversations);
    expect(await services.operations.enroll(reader.socket, detect(), { userId: 5, auditPrincipal })).toEqual({
      ok: true,
    });
    return { ...services, card, audit: services.operations['audit'].recordAttractap as jest.Mock };
  }

  it.each([
    ['a session', session, {}],
    ['an API token', apiToken, { apiTokenId: 12 }],
  ])('records card.linked for the admin who enrolled by %s', async (_label, principal, token) => {
    const { audit, cards } = await enrolledBy(principal);

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({
      action: 'card.linked',
      actorId: principal.userId,
      authenticationMethod: principal.authenticationMethod,
      ...token,
      subjectId: cards[0].id,
      details: { source: 'reader-enrollment' },
    });
  });

  it.each([
    ['a session', session, {}],
    ['an API token', apiToken, { apiTokenId: 12 }],
  ])('records card.unlinked for the admin who reset the card by %s', async (_label, principal, token) => {
    const { operations, cards, card, conversations, audit } = await enrolledBy(session);
    const cardId = cards[0].id;
    audit.mockClear();
    const reader = createRelayReader(card, conversations, 0, { readerId: 31 });

    expect(await operations.reset(reader.socket, detect(), { cardId, auditPrincipal: principal })).toEqual({
      ok: true,
    });

    expect(cards).toHaveLength(0);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({
      action: 'card.unlinked',
      actorId: principal.userId,
      authenticationMethod: principal.authenticationMethod,
      ...token,
      subjectId: cardId,
      details: { readerId: 31, source: 'reader-reset' },
    });
  });

  it('records nothing when the reset deleted no card (it was already gone)', async () => {
    const { operations, cards, card, conversations, audit, attractapService } = await enrolledBy(session);
    audit.mockClear();
    attractapService.deleteNFCCard.mockResolvedValueOnce({ affected: 0 });
    const reader = createRelayReader(card, conversations);

    expect((await operations.reset(reader.socket, detect(), { cardId: cards[0].id, auditPrincipal: session })).ok).toBe(
      true,
    );

    expect(audit).not.toHaveBeenCalled();
  });

  it('records nothing when the reset was not confirmed', async () => {
    const { operations, cards, card, conversations, audit } = await enrolledBy(session);
    audit.mockClear();
    card.failWritesAfter = 1;
    const reader = createRelayReader(card, conversations);

    expect((await operations.reset(reader.socket, detect(), { cardId: cards[0].id, auditPrincipal: session })).ok).toBe(
      false,
    );

    expect(cards).toHaveLength(1);
    expect(audit).not.toHaveBeenCalled();
  });

  it('records nothing when the enrollment was not confirmed', async () => {
    const services = createServices();
    const card = new EmulatedCard(kind);
    card.failWritesAfter = 0;
    const reader = createRelayReader(card, services.conversations);

    expect((await services.operations.enroll(reader.socket, detect(), { userId: 5, auditPrincipal: session })).ok).toBe(
      false,
    );

    expect(services.operations['audit'].recordAttractap).not.toHaveBeenCalled();
  });
});
