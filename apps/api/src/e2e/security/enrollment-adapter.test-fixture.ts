import { Attractap, CompanionDevice } from '@attraccess/database-entities';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { WebSocket } from 'ws';
import request from 'supertest';
import { CompanionService } from '../../companion/companion.service';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { AttractapService } from '../../attractap/attractap.service';
import { ResourceListService } from '../../attractap/websockets/handlers/resource-list/resource-list.service';

export type DevicePacket = { data: { id: number; token: string; payload?: { id: number; token: string } } };
export type EnrollmentHarness = {
  app: NestExpressApplication;
  db: DataSource;
  admin: string;
  connect: (path?: string) => Promise<WebSocket>;
  receive: (socket: WebSocket, event: string) => Promise<unknown>;
  send: (socket: WebSocket, event: string, data: unknown) => void;
};

export function enrollmentAdapter(h: EnrollmentHarness, type: 'reader' | 'companion') {
  const reader = type === 'reader';
  const devices = reader ? h.db.getRepository(Attractap) : h.db.getRepository(CompanionDevice);
  const protectedCall = reader
    ? jest.spyOn(h.app.get(ResourceListService), 'sendResourceListToSocket')
    : jest.spyOn(h.app.get(CompanionGatewayService), 'handleIdleEvent');
  const create = async (current: () => boolean) => {
    if (reader) {
      const result = await h.app.get(AttractapService).createNewReader(undefined, current);
      return { id: result.reader.id, token: result.token };
    }
    const result = await h.app.get(CompanionService).createDevice(current);
    return { id: result.device.id, token: result.token };
  };
  const send = (socket: WebSocket, event: string, data: unknown) =>
    reader ? h.send(socket, 'EVENT', { type: event, payload: data }) : h.send(socket, event, data);
  const prefix = reader ? 'READER' : 'COMPANION';
  const receive = async (socket: WebSocket, suffix: string) => h.receive(socket, `${prefix}_${suffix}`);
  const announce = async (socket: WebSocket, code: string, oversized = false, notification = true) => {
    send(socket, `${prefix}_REGISTER`, {
      enrollmentCode: code,
      ...(oversized ? (reader ? { firmware: { version: 'x'.repeat(1100) } } : { platform: 'x'.repeat(1100) }) : {}),
    });
    if (notification) {
      try {
        return await receive(socket, 'ENROLLMENT_STATUS');
      } catch (error) {
        throw new Error(`${prefix} announcement ${code} failed (socket state ${socket.readyState})`, { cause: error });
      }
    }
    await new Promise<void>((resolve) => {
      socket.once('pong', () => resolve());
      socket.ping();
    });
  };
  const connect = async () => {
    const socket = await h.connect(reader ? '/api/attractap/websocket' : '/api/companion/websocket');
    await receive(socket, 'REQUEST_AUTHENTICATION');
    return socket;
  };
  const assertNoAuthority = async (socket: WebSocket) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    protectedCall.mockClear();
    send(socket, reader ? 'REQUEST_RESOURCE_LIST' : 'COMPANION_IDLE', reader ? {} : { idleSeconds: 1 });
    // A pong is an ordering barrier for the frames, followed by a turn for gateway dispatch.
    await new Promise<void>((resolve) => {
      socket.once('pong', () => resolve());
      socket.ping();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(protectedCall).not.toHaveBeenCalled();
  };
  return {
    devices,
    protectedCall,
    create,
    send,
    receive,
    announce,
    connect,
    assertNoAuthority,
    approve: (code: string) =>
      request(h.app.getHttpServer())
        .post(`/api/${reader ? 'attractap/readers' : 'companion-devices'}/enrollment/approve`)
        .set('Authorization', `Bearer ${h.admin}`)
        .send({ code }),
    credentials: async (socket: WebSocket) => {
      const packet = (await receive(socket, reader ? 'REGISTER' : 'REGISTER_RESPONSE')) as DevicePacket;
      return reader ? packet.data.payload : packet.data;
    },
    authenticate: (socket: WebSocket, credential: { id: number; token: string }) =>
      send(socket, `${prefix}_AUTHENTICATE`, credential),
    delayCreation: (fn: (current: () => boolean) => Promise<{ id: number; token: string }>) =>
      reader
        ? jest
            .spyOn(h.app.get(AttractapService), 'createNewReader')
            .mockImplementationOnce(async (_firmware, current) => {
              const result = await fn(current);
              return {
                reader: await h.db.getRepository(Attractap).findOneByOrFail({ id: result.id }),
                token: result.token,
              };
            })
        : jest.spyOn(h.app.get(CompanionService), 'createDevice').mockImplementationOnce(async (current) => {
            const result = await fn(current);
            return {
              device: await h.db.getRepository(CompanionDevice).findOneByOrFail({ id: result.id }),
              token: result.token,
            };
          }),
  };
}

let virtualTime = 0;
/** Keep limiter time monotonic across cases sharing the real application instance. */
export function enrollmentClock() {
  let time = Math.max(virtualTime, performance.now()) + 61000;
  const spy = jest.spyOn(performance, 'now').mockImplementation(() => time);
  return {
    advance: (ms: number) => {
      time += ms;
    },
    mockRestore: () => {
      virtualTime = time;
      spy.mockRestore();
    },
  };
}
