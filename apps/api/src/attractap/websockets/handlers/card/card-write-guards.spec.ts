/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { CardConversationService } from '../../card-conversation.service';
import { createRelayReader, detect } from '../../card-relay.test-fixture';
import { AttractapEventType } from '../../websocket.types';
import { ARMED_CARD_OPERATION_TTL_MS } from './card.handler';
import { createAttractapCardHandlerFixture } from './fixtures/handler.test-fixture';
import { resetTestFixture } from './fixtures/setup.test-fixture';

/** Enrollment and reset are checked again when the card arrives, and the reader can call them off. */
describe('AttractapCardHandler card write guards', () => {
  const scope = createAttractapCardHandlerFixture();
  const handler = () => scope.handler as any;
  const CARD = { uid: '04aabbcc', detectionId: 1 };

  beforeEach(() => {
    resetTestFixture(scope);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const connected = () => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    return socket;
  };
  const lastReply = (socket: any) => socket.sendMessage.mock.calls.at(-1)?.[0].data;
  const refuseWriters = () =>
    handler().cardWriterPolicy.assertAllowed.mockRejectedValue(
      new ForbiddenException('This reader is not allowed to enroll or reset cards'),
    );

  describe('allow-list', () => {
    it('refuses to arm a reset on a reader the admin policy excludes', async () => {
      const socket = connected();
      refuseWriters();

      await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        new ForbiddenException('READER_NOT_ALLOWED_TO_WRITE_CARDS'),
      );
      expect(socket.state.resetNfcCardData).toBeNull();
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('passes other policy failures through unchanged', async () => {
      connected();
      handler().cardWriterPolicy.assertAllowed.mockRejectedValueOnce(new Error('settings unavailable'));

      await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
        'settings unavailable',
      );
    });

    it('refuses the enrollment card when the reader was taken off the list after arming', async () => {
      const socket = connected();
      await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
      refuseWriters();

      await scope.handler.handleEnrollCard(socket, CARD);

      expect(handler().cardOperations.enroll).not.toHaveBeenCalled();
      expect(socket.state.enrollment).toBeNull();
      expect(lastReply(socket)).toEqual({
        type: AttractapEventType.ENROLL_NEW_CARD,
        payload: { error: 'READER_NOT_ALLOWED_TO_WRITE_CARDS' },
      });
    });

    it('refuses the reset card when the reader was taken off the list after arming', async () => {
      const socket = connected();
      await scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 });
      refuseWriters();

      await scope.handler.handleResetCard(socket, CARD);

      expect(handler().cardOperations.reset).not.toHaveBeenCalled();
      expect(socket.state.resetNfcCardData).toBeNull();
      expect(lastReply(socket)).toEqual({
        type: AttractapEventType.RESET_NFC_CARD,
        payload: { error: 'READER_NOT_ALLOWED_TO_WRITE_CARDS' },
      });
    });

    it('refuses the card when the policy cannot be read (fails closed)', async () => {
      const socket = connected();
      await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
      handler().cardWriterPolicy.assertAllowed.mockRejectedValueOnce(new Error('settings unavailable'));

      await scope.handler.handleEnrollCard(socket, CARD);

      expect(handler().cardOperations.enroll).not.toHaveBeenCalled();
      expect(lastReply(socket).payload).toEqual({ error: 'READER_NOT_ALLOWED_TO_WRITE_CARDS' });
    });
  });

  describe('expiry', () => {
    const later = (ms: number) => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + ms);
    };

    it('still accepts the enrollment card within the reader’s screen time plus margin', async () => {
      const socket = connected();
      await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
      later(ARMED_CARD_OPERATION_TTL_MS - 1000);

      await scope.handler.handleEnrollCard(socket, CARD);

      expect(handler().cardOperations.enroll).toHaveBeenCalled();
    });

    it('refuses an enrollment card that arrives long after arming', async () => {
      const socket = connected();
      await scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 });
      later(ARMED_CARD_OPERATION_TTL_MS + 1000);

      await scope.handler.handleEnrollCard(socket, CARD);

      expect(handler().cardOperations.enroll).not.toHaveBeenCalled();
      expect(socket.state.enrollment).toBeNull();
      expect(lastReply(socket).payload).toEqual({ error: 'ENROLLMENT_EXPIRED' });
    });

    it('refuses a reset card that arrives long after arming', async () => {
      const socket = connected();
      await scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 });
      later(ARMED_CARD_OPERATION_TTL_MS + 1000);

      await scope.handler.handleResetCard(socket, CARD);

      expect(handler().cardOperations.reset).not.toHaveBeenCalled();
      expect(socket.state.resetNfcCardData).toBeNull();
      expect(lastReply(socket).payload).toEqual({ error: 'RESET_EXPIRED' });
    });

    it('is at least the reader’s 30 s screen time', () => {
      expect(ARMED_CARD_OPERATION_TTL_MS).toBeGreaterThan(30_000);
    });
  });

  describe('cancel from the reader', () => {
    it.each([
      ['enroll', 'onEnrollNewCardCancel'],
      ['reset', 'onResetNfcCardCancel'],
    ] as const)('ends the running %s conversation', async (purpose, cancel) => {
      const conversations = new CardConversationService();
      handler().cardConversations = conversations;
      const reader = createRelayReader(null, conversations);
      const running = conversations.run(reader.socket, purpose, detect(), (channel) =>
        channel.exchange(Buffer.from([0x90, 0x60, 0, 0, 0])),
      );
      await new Promise(setImmediate);

      await handler()[cancel](reader.socket);

      expect(await running).toEqual({ ok: false, reason: 'CARD_REMOVED' });
    });

    it('leaves a conversation for another purpose alone', async () => {
      const conversations = new CardConversationService();
      handler().cardConversations = conversations;
      const reader = createRelayReader(null, conversations);
      const running = conversations.run(reader.socket, 'supervisor', detect(), (channel) =>
        channel.exchange(Buffer.from([0x90, 0x60, 0, 0, 0])),
      );
      await new Promise(setImmediate);

      await handler().onEnrollNewCardCancel(reader.socket);

      expect(reader.socket.state.cardConversation).not.toBeNull();
      conversations.abort(reader.socket, 'CARD_REMOVED');
      await running;
    });
  });
});
