/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WebSocket } from 'ws';
import { registerAttractapGatewayFixture } from './websocket.gateway.attractap-gateway.test-fixture';
import { READER_UI_SLOTS } from '@attraccess/plugins-backend-sdk';
import { SESSION_SUBPROTOCOL } from '../security/session-framing';
import { AttractapEvent, AttractapEventType } from './websocket.types';

const TOUCH_UI = {
  schemaVersion: 1,
  components: ['col', 'row', 'text', 'badge'],
  slots: Object.values(READER_UI_SLOTS),
  steps: ['confirm', 'choose', 'info'],
  maxPayloadBytes: 3072,
  maxNodes: 32,
  maxDepth: 5,
  maxLiveNodes: 64,
  display: { w: 480, h: 480, touch: true },
  input: { touch: true, buttons: 0, cardHold: true },
  feedback: { leds: false, beeper: true },
  charset: 'latin1',
  images: false,
};

describe('AttractapGateway reader UI messaging', () => {
  const fixture = registerAttractapGatewayFixture();
  const gateway = () => fixture.gateway as any;

  describe('ACK matching', () => {
    it('matches UI_* ACKs on the echoed messageId, so one ACK does not resolve every update in flight', async () => {
      const socket = fixture.createMockSocket({ id: 'ack-1', readerId: 1 });
      const first = gateway().waitForClientResponse(socket, AttractapEventType.UI_SLOT_UPDATE, 500, 3);
      const second = gateway().waitForClientResponse(socket, AttractapEventType.UI_SLOT_UPDATE, 500, 4);
      let firstDone = false;
      let secondDone = false;
      void first.then(
        () => (firstDone = true),
        () => undefined,
      );
      void second.then(
        () => (secondDone = true),
        () => undefined,
      );
      await new Promise((resolve) => setImmediate(resolve));

      await gateway().resolveClientResponseAwaiters(socket, AttractapEventType.UI_SLOT_UPDATE, 4);
      await new Promise((resolve) => setImmediate(resolve));
      expect(secondDone).toBe(true);
      expect(firstDone).toBe(false);

      await gateway().resolveClientResponseAwaiters(socket, AttractapEventType.UI_SLOT_UPDATE, undefined);
      await new Promise((resolve) => setImmediate(resolve));
      expect(firstDone).toBe(false); // an ACK without an id never resolves a UI message

      await gateway().resolveClientResponseAwaiters(socket, AttractapEventType.UI_SLOT_UPDATE, 3);
      await first;
    });

    it('keeps matching existing types on clientId and type only', async () => {
      const socket = fixture.createMockSocket({ id: 'ack-2', readerId: 1 });
      const waiting = gateway().waitForClientResponse(socket, AttractapEventType.RESOURCE_LIST, 500);
      await gateway().resolveClientResponseAwaiters(socket, AttractapEventType.RESOURCE_LIST, 99);
      await waiting;
    });
  });

  describe('frame size and retries', () => {
    afterEach(() => jest.useRealTimers());

    /** Connects a client through the real gateway; `session` routes sends through a TLS-session `send`. */
    async function connect(session: boolean) {
      const client = {
        close: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
        protocol: session ? SESSION_SUBPROTOCOL : '',
      } as unknown as WebSocket;
      const sessionSend = jest.fn();
      if (session) {
        const sessions = gateway().readerSessionService;
        sessions.open = jest.fn(() => ({ close: jest.fn() }));
        sessions.accept = jest.fn(async (socket: any, _connection: unknown, onReady: (s: unknown) => void) => {
          socket.send = sessionSend; // what ReaderSessionService.attach does
          onReady(socket);
        });
      }
      const connecting = fixture.gateway.handleConnection(client);
      await jest.advanceTimersByTimeAsync(0);
      const socket = [...fixture.websocketService.sockets.values()][0];
      const wire = session ? sessionSend : (client.send as jest.Mock);
      wire.mockClear();
      return { socket, wire, connecting };
    }
    const slotUpdate = (revision: number, text: string) =>
      new AttractapEvent(AttractapEventType.UI_SLOT_UPDATE, {
        resourceId: 12,
        slot: 'resource.details.header',
        owner: 'p',
        key: 'k',
        revision,
        tree: { t: 'text', text },
      });
    const sentRevisions = (wire: jest.Mock) =>
      wire.mock.calls
        .map((call) => JSON.parse(String(call[0])).data)
        .filter((data: any) => data.type === AttractapEventType.UI_SLOT_UPDATE)
        .map((data: any) => data.payload.revision);

    it.each([
      ['legacy websocket', false],
      ['TLS session', true],
    ])('refuses a UI frame over 4096 bytes and still sends small ones (%s)', async (_name, session) => {
      jest.useFakeTimers();
      const { socket, wire, connecting } = await connect(session);

      await expect(socket.sendMessage(slotUpdate(1, 'x'.repeat(4200)))).resolves.toBe(false);
      expect(wire).not.toHaveBeenCalled();

      const small = socket.sendMessage(slotUpdate(2, 'small'));
      await jest.advanceTimersByTimeAsync(0);
      expect(sentRevisions(wire)).toEqual([2]);
      expect(Buffer.byteLength(String(wire.mock.calls[0][0]), 'utf8')).toBeLessThanOrEqual(4096);

      await jest.advanceTimersByTimeAsync(15_000);
      await small;
      await connecting;
    });

    it('resends only the newest revision when the reader withholds the ACK of an older one', async () => {
      jest.useFakeTimers();
      const { socket, wire, connecting } = await connect(false);
      socket.readerId = 1;
      const slots = (gateway().uiHandler as any).slots;
      let text = 'A';
      slots.registry.providers = () => [
        {
          plugin: 'p',
          provider: {
            getSlotContributions: () => [{ slotId: 'resource.details.header', key: 'k', tree: { t: 'text', text } }],
          },
        },
      ];
      slots.settings.widgetToggles = jest.fn(async () => ({ readerEnabled: true, disabled: new Set() }));
      fixture.attractapService.findReaderById.mockResolvedValue({ id: 1, resources: [{ id: 12 }] });
      await slots.onFirmwareInfo(socket, TOUCH_UI);
      expect(sentRevisions(wire)).toEqual([1]); // no ACK follows

      await jest.advanceTimersByTimeAsync(2100);
      text = 'B';
      await slots.sync(socket);
      expect(sentRevisions(wire)).toEqual([1, 2]);

      // Revision 1 times out at 4 s, revision 2 at 6.1 s: only revision 2 is sent again.
      await jest.advanceTimersByTimeAsync(4200);
      expect(sentRevisions(wire)).toEqual([1, 2, 2]);

      await jest.advanceTimersByTimeAsync(15_000);
      await connecting;
    });
  });

  describe('dispatch', () => {
    it('lets UI_STEP_RESULT, UI_RENDER_REPORT and CARD_SESSION_ENDED reach the UI handler only', async () => {
      const socket = fixture.createMockSocket({ id: 'ui-1', readerId: 1 });
      const ui = gateway().uiHandler;
      const result = jest.spyOn(ui, 'handleStepResult').mockImplementation(() => undefined);
      const report = jest.spyOn(ui, 'handleRenderReport').mockImplementation(() => undefined);
      const ended = jest.spyOn(ui, 'handleCardSessionEnded').mockImplementation(() => undefined);
      const start = jest.spyOn(gateway().sessionHandler, 'handleStartResourceUsageSession');

      await fixture.gateway.onClientEvent(
        new AttractapEvent(AttractapEventType.UI_STEP_RESULT, { stepId: 'a', action: 'confirm' }).data,
        socket,
      );
      await fixture.gateway.onClientEvent(new AttractapEvent(AttractapEventType.UI_RENDER_REPORT, {}).data, socket);
      await fixture.gateway.onClientEvent(
        new AttractapEvent(AttractapEventType.CARD_SESSION_ENDED, { cardSessionId: 'c' }).data,
        socket,
      );
      expect([result, report, ended].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
      expect(start).not.toHaveBeenCalled();
    });

    it('rejects server-to-reader UI types from readers', async () => {
      const socket = fixture.createMockSocket({ id: 'ui-2', readerId: 1 });
      for (const type of [
        AttractapEventType.UI_SLOT_UPDATE,
        AttractapEventType.UI_STEP_REQUEST,
        AttractapEventType.UI_STEP_CANCEL,
      ]) {
        await expect(fixture.gateway.onClientEvent(new AttractapEvent(type, {}).data, socket)).rejects.toThrow(
          'SERVER SIDE ONLY',
        );
      }
    });

    it('drops reserved phase 7 types without a handler or an error', async () => {
      const socket = fixture.createMockSocket({ id: 'ui-3', readerId: 1 });
      for (const type of [
        AttractapEventType.UI_ACTION,
        AttractapEventType.UI_SCREEN_DISMISSED,
        AttractapEventType.UI_SCREEN_OPEN,
      ]) {
        await expect(fixture.gateway.onClientEvent(new AttractapEvent(type, {}).data, socket)).resolves.toBeUndefined();
      }
    });
  });

  describe('close cleanup', () => {
    it('discards open steps and the card session when the socket closes', async () => {
      const socket = fixture.createMockSocket({ id: 'cl-1', readerId: 1 });
      const cleanup = jest.spyOn(gateway().uiHandler, 'cleanup');
      fixture.websocketService.sockets.set(socket.id, socket);
      await fixture.gateway.handleDisconnect(socket);
      expect(cleanup).toHaveBeenCalledWith(socket);
    });
  });
});
