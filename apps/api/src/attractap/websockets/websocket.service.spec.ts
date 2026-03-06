import { Test, TestingModule } from '@nestjs/testing';
import { WebsocketService } from './websocket.service';
import { AuthenticatedWebSocket } from './websocket.types';

describe('WebsocketService', () => {
  let service: WebsocketService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebsocketService],
    }).compile();

    service = module.get(WebsocketService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('starts with an empty sockets map', () => {
    expect(service.sockets.size).toBe(0);
  });

  it('can add and retrieve sockets', () => {
    const mockSocket = { id: 'abc' } as unknown as AuthenticatedWebSocket;
    service.sockets.set('abc', mockSocket);

    expect(service.sockets.size).toBe(1);
    expect(service.sockets.get('abc')).toBe(mockSocket);
  });

  it('can delete sockets', () => {
    const mockSocket = { id: 'abc' } as unknown as AuthenticatedWebSocket;
    service.sockets.set('abc', mockSocket);
    service.sockets.delete('abc');

    expect(service.sockets.size).toBe(0);
    expect(service.sockets.get('abc')).toBeUndefined();
  });

  it('tracks multiple sockets independently', () => {
    const socket1 = { id: 's1', readerId: 1 } as unknown as AuthenticatedWebSocket;
    const socket2 = { id: 's2', readerId: 2 } as unknown as AuthenticatedWebSocket;
    service.sockets.set('s1', socket1);
    service.sockets.set('s2', socket2);

    expect(service.sockets.size).toBe(2);
    expect(service.sockets.get('s1')).toBe(socket1);
    expect(service.sockets.get('s2')).toBe(socket2);
  });
});
