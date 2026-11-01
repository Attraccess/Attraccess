/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WebSocket } from 'ws';
import { registerAttractapGatewayFixture } from './websocket.gateway.attractap-gateway.test-fixture';
import { AttractapEvent, AttractapEventType } from './websocket.types';

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

  describe('frame size', () => {
    it('refuses to send a UI frame over 4096 bytes and still sends small ones', async () => {
      const client = { close: jest.fn(), send: jest.fn(), on: jest.fn() } as unknown as WebSocket;
      const connecting = fixture.gateway.handleConnection(client);
      await new Promise((resolve) => setImmediate(resolve));
      const socket = [...fixture.websocketService.sockets.values()][0];
      (client.send as jest.Mock).mockClear();

      const big = new AttractapEvent(AttractapEventType.UI_SLOT_UPDATE, {
        tree: { t: 'text', text: 'x'.repeat(4200) },
      });
      await expect(socket.sendMessage(big)).resolves.toBe(false);
      expect(client.send).not.toHaveBeenCalled();

      jest.useFakeTimers();
      jest.runAllTimers();
      jest.useRealTimers();
      await connecting;
    }, 30000);
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
