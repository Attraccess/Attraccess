import { WebSocketServer, WebSocket } from 'ws';
import { Inbox } from '../helpers/inbox';

export interface ReaderMessage {
  connection: number;
  event: string;
  type: string;
  payload: any;
}
export class MockServer {
  readonly messages = new Inbox<ReaderMessage>();
  readonly connections = new Inbox<number>();
  private server?: WebSocketServer;
  private socket?: WebSocket;
  connection = 0;
  port = 0;
  async start() {
    this.server = new WebSocketServer({
      host: '0.0.0.0',
      port: Number(process.env.HIL_WS_PORT ?? 0),
      path: '/api/attractap/websocket',
    });
    this.server.on('error', (error) => {
      this.messages.fail(error);
      this.connections.fail(error);
    });
    this.server.on('connection', (socket) => {
      this.socket = socket;
      const connection = ++this.connection;
      this.connections.push(connection);
      socket.on('message', (raw, binary) => {
        try {
          if (binary) throw new Error('Unexpected inbound binary frame');
          const message = JSON.parse(raw.toString());
          if (message.event === 'HEARTBEAT') socket.send(JSON.stringify({ event: 'HEARTBEAT' }));
          this.messages.push({
            connection,
            event: message.event,
            type: message.data?.type ?? 'HEARTBEAT',
            payload: message.data?.payload,
          });
        } catch (error) {
          this.messages.fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
      // This is the actual backend handshake; READER_AUTHENTICATE is inbound.
      this.sendWebsocketMessage('READER_REQUEST_AUTHENTICATION', {});
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('listening', resolve);
      this.server!.once('error', reject);
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server TCP port');
    this.port = address.port;
  }
  sendWebsocketMessage(type: string, payload: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('No connected reader');
    this.socket.send(JSON.stringify({ event: 'EVENT', data: { type, payload } }));
  }
  sendBinary(bytes: Buffer) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('No connected reader');
    this.socket.send(bytes, { binary: true });
  }
  waitForWebsocketMessage(type: string, after = 0, connection = this.connection, timeout = 30000) {
    return this.messages.wait((message) => message.type === type && message.connection === connection, after, timeout);
  }
  disconnect() {
    this.socket?.terminate();
  }
  async close() {
    this.server?.clients.forEach((client) => client.terminate());
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }
}
