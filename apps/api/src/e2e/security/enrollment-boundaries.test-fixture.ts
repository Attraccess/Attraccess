import { WebSocket } from 'ws';
import { DeviceEnrollmentService } from '../../device-enrollment/device-enrollment.service';
import { enrollmentAdapter, enrollmentClock, EnrollmentHarness } from './enrollment-adapter.test-fixture';

export function registerEnrollmentBoundaries(get: () => EnrollmentHarness) {
  for (const type of ['reader', 'companion'] as const) {
    it(`${type}: enforces absolute expiry, reannouncement, metadata, reconnect and shared admission bounds`, async () => {
      const h = get();
      const a = enrollmentAdapter(h, type);
      const before = await a.devices.count();
      const clock = enrollmentClock();
      const opened: WebSocket[] = [];
      const connect = async () => {
        const socket = await a.connect();
        opened.push(socket);
        return socket;
      };
      const close = async (socket: WebSocket) => {
        if (socket.readyState === WebSocket.CLOSED) return;
        const closed = new Promise<number>((resolve) => socket.once('close', resolve));
        socket.close();
        await closed;
      };
      const rejectConnection = async () => {
        const socket = await h.connect(type === 'reader' ? '/api/attractap/websocket' : '/api/companion/websocket');
        opened.push(socket);
        expect(await new Promise<number>((resolve) => socket.once('close', resolve))).toBe(1008);
      };
      const enrollment = h.app.get(DeviceEnrollmentService);
      let admit: jest.SpyInstance | undefined;
      try {
        clock.advance(61000);
        const socket = await connect();
        await a.announce(socket, 'REP-123');
        clock.advance(20000);
        await a.announce(socket, 'REP-123', false, false);
        clock.advance(10000);
        await a.approve('REP-123').expect(404);
        await a.announce(socket, 'NEW-456');
        await a.announce(socket, 'REP-123'); // A rotated-out code cannot be restored.
        await a.approve('REP-123').expect(404);
        clock.advance(269999);
        const deadlineClosed = new Promise((resolve) => socket.once('close', resolve));
        await a.announce(socket, 'ABS-123');
        clock.advance(1); // The remaining one-millisecond real timer closes this connection.
        await deadlineClosed;
        await a.approve('ABS-123').expect(404);
        await a.assertNoAuthority(socket);
        await close(socket);
        clock.advance(61000);
        const metadata = await connect();
        const status = await a.announce(metadata, 'BIG-123', true);
        expect(JSON.stringify(status)).toContain('metadata');
        await a.approve('BIG-123').expect(404);
        await a.assertNoAuthority(metadata);
        await a.announce(metadata, 'OKA-123');
        for (const code of ['OKB-123', 'OKC-123', 'OKD-123']) await a.announce(metadata, code);
        await a.approve('OKD-123').expect(404);
        await a.assertNoAuthority(metadata);
        await close(metadata);
        clock.advance(61000);
        for (let i = 0; i < 10; i++) {
          const reconnect = await connect();
          await a.assertNoAuthority(reconnect);
          await close(reconnect);
        }
        await rejectConnection(); // Closing sockets does not replenish the IP connection allowance.
        clock.advance(61000);
        for (let i = 0; i < 8; i++) {
          const pending = await connect();
          await a.announce(pending, `CAP-00${i}`);
          await a.assertNoAuthority(pending);
        }
        await rejectConnection(); // Pending-per-IP cap is separate from rate counters.
        for (const pending of opened) await close(pending);
        clock.advance(61000);
        const realAdmit = enrollment.admit.bind(enrollment);
        let peer = 0;
        // Model distinct remote hosts at the adapter boundary; sockets, gateways and DB stay real.
        admit = jest
          .spyOn(enrollment, 'admit')
          .mockImplementation((s, kind) => realAdmit(s, kind, `test-peer-${peer++}`));
        for (let i = 0; i < 100; i++) {
          const pending = await connect();
          await a.announce(pending, `G${String(i).padStart(2, '0')}-123`);
        }
        await rejectConnection(); // Global connection rate, despite distinct peers.
        clock.advance(61000);
        for (let i = 100; i < 128; i++) {
          const pending = await connect();
          await a.announce(pending, `H${String(i - 100).padStart(2, '0')}-123`);
        }
        await rejectConnection(); // Global pending cap across connection-rate windows.
        for (const pending of opened) await a.assertNoAuthority(pending);
        expect(await a.devices.count()).toBe(before);
      } finally {
        admit?.mockRestore();
        clock.mockRestore();
        a.protectedCall.mockRestore();
        await Promise.all(opened.map(close));
      }
    }, 60000);
  }
}
