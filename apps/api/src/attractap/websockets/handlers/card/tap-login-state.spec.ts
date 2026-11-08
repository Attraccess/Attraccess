/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebSocket } from 'ws';
import { AttractapEventType } from '../../websocket.types';
import { CardSessionService } from '../ui/card-session.service';
import { createAttractapCardHandlerFixture } from './fixtures/handler.test-fixture';
import { resetTestFixture } from './fixtures/setup.test-fixture';

const CARD = { uid: '04aabbcc', detectionId: 1 };
const RESOURCE_ID = 10;
const CARD_USER = { id: 5, username: 'carduser' };

/** A login tap and what happens to the connection's login state around it. */
describe('AttractapCardHandler login tap', () => {
  const scope = createAttractapCardHandlerFixture();
  let cardSessions: CardSessionService;

  beforeEach(() => {
    resetTestFixture(scope);
    cardSessions = (scope.handler as any).cardSessions;
    scope.attractapService.getNFCCardByUID.mockResolvedValue({ keyNo: 1, isActive: true, user: CARD_USER });
  });

  const successReplies = (socket: any) =>
    socket.sendMessage.mock.calls
      .map(([event]: any[]) => event.data)
      .filter((data: any) => data.type === AttractapEventType.CARD_AUTHENTICATION_DATA && data.payload.username);

  /** What the gateway does on READER_SESSION_ENDED: the login and its card session end. */
  const logOut = (socket: any) => {
    scope.handler.clearVerifiedUser(socket);
    if (socket.state.cardSession) cardSessions.end(socket, socket.state.cardSession.id, 'reader');
  };

  /** Runs `during` while the tap waits for the introduction lookup, after the card session was issued. */
  const duringLookups = (during: () => void) =>
    scope.resourceUsageService.canControllResource.mockImplementationOnce(async () => {
      during();
      return true;
    });

  describe('when the login ends while the tap is being answered', () => {
    it('keeps the verified user and the card session together across a logout during the language lookup', async () => {
      const socket = scope.createMockSocket();
      jest.spyOn((scope.handler as any).settingsService, 'resolveLanguage').mockImplementationOnce(async () => {
        logOut(socket);
        return 'en';
      });

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID);

      // Either both exist (the tap logged in after the logout) or neither: never a card session for nobody.
      expect(socket.state.verifiedUserId).toBe(CARD_USER.id);
      expect(socket.state.cardSession).toMatchObject({ userId: CARD_USER.id });
      expect(successReplies(socket)).toHaveLength(1);
    });

    it('does not answer with the user after a logout during the lookups', async () => {
      const socket = scope.createMockSocket();
      duringLookups(() => logOut(socket));

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID);

      expect(socket.state.verifiedUserId).toBeNull();
      expect(socket.state.cardSession).toBeNull();
      expect(successReplies(socket)).toHaveLength(0);
    });

    it('ends the card session when the connection authenticated again during the lookups', async () => {
      const socket = scope.createMockSocket();
      // Re-authentication forgets the login but leaves the card session to the tap that issued it.
      duringLookups(() => scope.handler.clearVerifiedUser(socket));

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID);

      expect(socket.state.cardSession).toBeNull();
      expect(successReplies(socket)).toHaveLength(0);
    });

    it('ends the card session without telling anyone when the connection closed during the lookups', async () => {
      const socket = scope.createMockSocket();
      const ended = jest.fn();
      cardSessions.onEnded(ended);
      duringLookups(() => (socket.readyState = WebSocket.CLOSED));

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID);

      expect(socket.state.cardSession).toBeNull();
      expect(ended).not.toHaveBeenCalled();
      expect(successReplies(socket)).toHaveLength(0);
    });

    it('leaves a newer tap of the same user alone', async () => {
      const socket = scope.createMockSocket();
      duringLookups(() => {
        // The same card again, quicker: it logs in with its own card session.
        socket.state.verifiedUserId = CARD_USER.id;
        cardSessions.issue(socket, CARD_USER.id, 'en');
      });

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID);
      const newer = socket.state.cardSession;

      expect(newer).toMatchObject({ userId: CARD_USER.id });
      expect(socket.state.verifiedUserId).toBe(CARD_USER.id);
      expect(successReplies(socket)).toHaveLength(0);
    });
  });

  describe('what the previous login left on the connection', () => {
    const readerFlow = (requesterUserId: number) => ({
      resourceId: RESOURCE_ID,
      requesterUserId,
      requestId: 'req-1',
      approvedSupervisorUserId: 2,
    });
    const drafts = () => ({ [`${RESOURCE_ID}:start`]: { 1: 'answer of the previous user' } });

    it('drops form answers and the reader-started supervision of another user', async () => {
      const socket = scope.createMockSocket({ state: { formDrafts: drafts(), supervisionFlow: readerFlow(9) } });

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID, 9);

      expect(socket.state.formDrafts).toBeUndefined();
      expect((scope.handler as any).supervisionHandler.cancelForSocket).toHaveBeenCalledWith(socket);
      expect(socket.state.supervisionFlow).toBeNull();
      expect(socket.state.verifiedUserId).toBe(CARD_USER.id);
    });

    it('drops form answers when nobody was logged in before', async () => {
      const socket = scope.createMockSocket({ state: { formDrafts: drafts() } });

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID, null);

      expect(socket.state.formDrafts).toBeUndefined();
    });

    it('keeps both when the same user taps again, as a card confirmation asks', async () => {
      const flow = readerFlow(CARD_USER.id);
      const socket = scope.createMockSocket({ state: { formDrafts: drafts(), supervisionFlow: flow } });

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID, CARD_USER.id);

      expect(socket.state.formDrafts).toEqual(drafts());
      expect(socket.state.supervisionFlow).toBe(flow);
      expect((scope.handler as any).supervisionHandler.cancelForSocket).not.toHaveBeenCalled();
    });

    it('keeps a web-started supervision, which belongs to the reader rather than a login', async () => {
      const flow = { ...readerFlow(9), approvedSupervisorUserId: null, webInitiated: true };
      const socket = scope.createMockSocket({ state: { supervisionFlow: flow } });

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID, 9);

      expect(socket.state.supervisionFlow).toBe(flow);
    });

    it('drops both when the tapped card fails its check, even for the same user', async () => {
      scope.attractapService.getNFCCardByUID.mockResolvedValue(null);
      const socket = scope.createMockSocket({
        state: { formDrafts: drafts(), supervisionFlow: readerFlow(CARD_USER.id) },
      });

      await scope.handler.handleCardTap(socket, CARD, RESOURCE_ID, CARD_USER.id);

      expect(socket.state.formDrafts).toBeUndefined();
      expect(socket.state.supervisionFlow).toBeNull();
    });
  });
});
