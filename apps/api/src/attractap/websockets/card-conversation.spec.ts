/* eslint-disable @typescript-eslint/no-explicit-any */
import { EmulatedCard } from '../card-crypto/card-emulator.test-fixture';
import { CARD_CONVERSATION_LIMITS, CardConversationService } from './card-conversation.service';
import { createRelayReader, detect } from './card-relay.test-fixture';
import { AttractapEventType } from './websocket.types';

const GET_VERSION = Buffer.from([0x90, 0x60, 0, 0, 0]);

const run = (
  conversations: CardConversationService,
  socket: any,
  work?: (channel: any) => Promise<unknown>,
  detection = detect(),
  purpose = 'tap',
) => conversations.run(socket, purpose, detection, work ?? (async (channel) => channel.exchange(GET_VERSION)));

const idle = (conversations = new CardConversationService(), options?: { readerId?: number; socketId?: string }) =>
  createRelayReader(null, conversations, 0, options);

const answerLast = (conversations: CardConversationService, reader: ReturnType<typeof idle>, response = '9100') => {
  const { conversationId, seq } = reader.apdus().at(-1).payload;
  conversations.handleResponse(reader.socket, { conversationId, seq, response });
};

describe('card conversations', () => {
  it('ignores answers with the wrong conversation id or sequence number', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    const result = run(conversations, reader.socket);
    await new Promise(setImmediate);
    const { conversationId, seq } = reader.apdus()[0].payload;

    conversations.handleResponse(reader.socket, { conversationId: 'other', seq, response: '9100' });
    conversations.handleResponse(reader.socket, { conversationId, seq: seq + 1, response: '9100' });
    conversations.handleResponse(reader.socket, { conversationId, seq, response: 'zz' });
    expect(reader.socket.state.cardConversation.pending).not.toBeNull();

    conversations.handleResponse(reader.socket, { conversationId, seq, response: '9100' });
    expect(await result).toMatchObject({ ok: true });
  });

  it('refuses an oversized answer before looking at its characters', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    const result = run(conversations, reader.socket);
    await new Promise(setImmediate);
    const { conversationId, seq } = reader.apdus()[0].payload;
    const huge = 'ab'.repeat(CARD_CONVERSATION_LIMITS.maxResponseLength + 1);
    const test = jest.spyOn(RegExp.prototype, 'test');

    conversations.handleResponse(reader.socket, { conversationId, seq, response: huge });

    expect(test.mock.calls.some(([input]) => input === huge)).toBe(false);
    test.mockRestore();
    expect(reader.socket.state.cardConversation.pending).not.toBeNull();
    answerLast(conversations, reader);
    expect(await result).toMatchObject({ ok: true });
  });

  it('carries the detection id on every APDU and on the end of the conversation', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    const detection = detect();
    const result = run(conversations, reader.socket, undefined, detection);
    await new Promise(setImmediate);
    answerLast(conversations, reader);
    await result;

    expect(reader.apdus()[0].payload).toEqual(
      expect.objectContaining({ detectionId: detection.detectionId, seq: 1, apdu: '9060000000' }),
    );
    expect(reader.ends()).toEqual([
      {
        type: AttractapEventType.CARD_CONVERSATION_END,
        payload: { conversationId: reader.apdus()[0].payload.conversationId, detectionId: detection.detectionId },
      },
    ]);
  });

  it('allows one conversation per reader: a new tap replaces the old one', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    const first = run(conversations, reader.socket);
    await new Promise(setImmediate);

    const second = run(conversations, reader.socket);
    expect(await first).toEqual({ ok: false, reason: 'CARD_REMOVED' });
    await new Promise(setImmediate);
    answerLast(conversations, reader);
    expect(await second).toMatchObject({ ok: true });
    expect(conversations.activeConversations).toBe(0);
  });

  it('allows one conversation per reader across its connections', async () => {
    const conversations = new CardConversationService();
    const a = idle(conversations, { readerId: 7, socketId: 'a' });
    const b = idle(conversations, { readerId: 7, socketId: 'b' });
    const other = idle(conversations, { readerId: 8, socketId: 'c' });
    const onA = run(conversations, a.socket);
    const onOther = run(conversations, other.socket);
    await new Promise(setImmediate);

    const onB = run(conversations, b.socket);

    expect(await onA).toEqual({ ok: false, reason: 'CARD_REMOVED' });
    await new Promise(setImmediate);
    answerLast(conversations, b);
    answerLast(conversations, other);
    expect(await onB).toMatchObject({ ok: true });
    expect(await onOther).toMatchObject({ ok: true });
    expect(conversations.activeConversations).toBe(0);
  });

  it('does not let a stale detection abort the conversation of a newer one', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    const older = detect();
    const newer = detect();
    const current = run(conversations, reader.socket, undefined, newer);
    await new Promise(setImmediate);

    // The older detection's database lookups finished late; its conversation must not start.
    expect(await run(conversations, reader.socket, undefined, older)).toEqual({ ok: false, reason: 'CARD_REMOVED' });

    expect(reader.socket.state.cardConversation).not.toBeNull();
    answerLast(conversations, reader);
    expect(await current).toMatchObject({ ok: true });
  });

  it('ends a running conversation as soon as the reader reports a newer detection', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    const first = detect();
    const result = run(conversations, reader.socket, undefined, first);
    await new Promise(setImmediate);

    conversations.noteDetection(reader.socket, first.detectionId + 1);

    expect(await result).toEqual({ ok: false, reason: 'CARD_REMOVED' });
  });

  it('fails a conversation that was aborted before its work finished, even if the work resolved', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = run(conversations, reader.socket, async () => {
      await gate; // e.g. database work after the card answered
      return 'verified';
    });
    await new Promise(setImmediate);
    conversations.abort(reader.socket, 'READER_SESSION_ENDED');
    release();

    expect(await slow).toEqual({ ok: false, reason: 'READER_SESSION_ENDED' });
    expect(conversations.activeConversations).toBe(0);
  });

  it('reports an enroll or reset whose writes finished as done, even if the conversation was aborted meanwhile', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const enroll = run(
      conversations,
      reader.socket,
      async () => {
        await gate; // the card record is being written
        return 'recorded';
      },
      detect(),
      'enroll',
    );
    await new Promise(setImmediate);
    conversations.abort(reader.socket, 'TIMEOUT');
    release();

    expect(await enroll).toEqual({ ok: true, value: 'recorded' });
    expect(conversations.activeConversations).toBe(0);
  });

  it('does not start a conversation for a detection the reader ended before it began', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    const detection = detect();
    conversations.noteDetection(reader.socket, detection.detectionId);
    // Logout while the card's records were still being looked up.
    conversations.abort(reader.socket, 'READER_SESSION_ENDED');

    expect(await run(conversations, reader.socket, undefined, detection)).toEqual({
      ok: false,
      reason: 'CARD_REMOVED',
    });
    expect(reader.apdus()).toHaveLength(0);
    // The next card presentation works again.
    const next = run(conversations, reader.socket);
    await new Promise(setImmediate);
    answerLast(conversations, reader);
    expect(await next).toMatchObject({ ok: true });
  });

  it('ignores an answer sent on another connection with this conversation id', async () => {
    const conversations = new CardConversationService();
    const a = idle(conversations, { readerId: 7, socketId: 'a' });
    const b = idle(conversations, { readerId: 8, socketId: 'b' });
    const onA = run(conversations, a.socket);
    await new Promise(setImmediate);
    const { conversationId, seq } = a.apdus()[0].payload;

    conversations.handleResponse(b.socket, { conversationId, seq, response: '9100' });

    expect(a.socket.state.cardConversation.pending).not.toBeNull();
    expect(b.socket.state.verifiedUserId).toBeNull();
    conversations.abort(a.socket, 'CARD_REMOVED');
    expect(await onA).toEqual({ ok: false, reason: 'CARD_REMOVED' });
  });

  it('leaves the login state alone: only the router clears it for a new tap', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    reader.socket.state.verifiedUserId = 5;

    const tap = run(conversations, reader.socket);
    expect(reader.socket.state.verifiedUserId).toBe(5);
    conversations.abort(reader.socket, 'CARD_REMOVED');
    await tap;
  });
});

describe('conversation limits', () => {
  it('says busy once the server-wide limit is reached', async () => {
    const conversations = new CardConversationService();
    const readers = Array.from({ length: CARD_CONVERSATION_LIMITS.maxConcurrent }, (_, index) =>
      idle(conversations, { readerId: 1000 + index }),
    );
    const open = readers.map((reader) => run(conversations, reader.socket));
    const extra = idle(conversations, { readerId: 1 });

    expect(conversations.isBusy(extra.socket)).toBe(true);
    expect(await run(conversations, extra.socket)).toEqual({ ok: false, reason: 'BUSY' });

    readers.forEach((reader) => conversations.abort(reader.socket, 'READER_UNREACHABLE'));
    await Promise.all(open);
    expect(conversations.activeConversations).toBe(0);
    expect(conversations.isBusy(extra.socket)).toBe(false);
  });

  it('says busy when the reader cannot drain its send queue', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);
    reader.socket.bufferedAmount = CARD_CONVERSATION_LIMITS.maxBufferedBytes + 1;

    expect(conversations.isBusy(reader.socket)).toBe(true);
    expect(await run(conversations, reader.socket)).toEqual({ ok: false, reason: 'BUSY' });
  });

  it('ends a conversation that needs more than the allowed number of exchanges', async () => {
    const conversations = new CardConversationService();
    const reader = createRelayReader(new EmulatedCard('ntag424'), conversations);

    const result = await run(conversations, reader.socket, async (channel) => {
      for (let i = 0; i <= CARD_CONVERSATION_LIMITS.maxExchanges; i++) await channel.exchange(GET_VERSION);
    });

    expect(result).toEqual({ ok: false, reason: 'TOO_MANY_EXCHANGES' });
    expect(reader.apdus()).toHaveLength(CARD_CONVERSATION_LIMITS.maxExchanges);
    expect(conversations.activeConversations).toBe(0);
    expect(reader.sent.at(-1)?.type).toBe(AttractapEventType.CARD_CONVERSATION_END);
  });

  it('gives up on a card answer that never comes and tells the reader', async () => {
    jest.useFakeTimers();
    try {
      const conversations = new CardConversationService();
      const reader = idle(conversations);
      const result = run(conversations, reader.socket);
      await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.exchangeTimeoutMs + 10);

      expect(await result).toEqual({ ok: false, reason: 'TIMEOUT' });
      expect(conversations.activeConversations).toBe(0);
      expect(reader.sent.at(-1)?.type).toBe(AttractapEventType.CARD_CONVERSATION_END);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cuts off a conversation that takes too long overall', async () => {
    jest.useFakeTimers();
    try {
      const conversations = new CardConversationService();
      const reader = idle(conversations);
      const slow = run(conversations, reader.socket, async (channel) => {
        for (;;) {
          const pending = channel.exchange(GET_VERSION);
          await jest.advanceTimersByTimeAsync(0);
          const { conversationId, seq } = reader.apdus().at(-1).payload;
          setTimeout(
            () => conversations.handleResponse(reader.socket, { conversationId, seq, response: '9100' }),
            CARD_CONVERSATION_LIMITS.exchangeTimeoutMs - 500,
          );
          await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.exchangeTimeoutMs - 400);
          await pending;
        }
      });
      await jest.advanceTimersByTimeAsync(CARD_CONVERSATION_LIMITS.conversationTimeoutMs + 100);

      expect(await slow).toEqual({ ok: false, reason: 'TIMEOUT' });
      expect(conversations.activeConversations).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cleans up and tells the reader when the work fails for another reason', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);

    await expect(
      run(conversations, reader.socket, async () => {
        throw new Error('database unavailable');
      }),
    ).rejects.toThrow('database unavailable');

    expect(conversations.activeConversations).toBe(0);
    expect(reader.socket.state.cardConversation).toBeNull();
    expect(reader.sent.at(-1)?.type).toBe(AttractapEventType.CARD_CONVERSATION_END);
  });

  it('tells the reader when the conversation is over', async () => {
    const conversations = new CardConversationService();
    const reader = idle(conversations);

    await run(conversations, reader.socket, async () => undefined);

    expect(reader.sent.at(-1)?.type).toBe(AttractapEventType.CARD_CONVERSATION_END);
  });
});
