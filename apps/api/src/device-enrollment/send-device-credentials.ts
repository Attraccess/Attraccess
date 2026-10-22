import { WebSocket } from 'ws';
/** One write only. A failed/ambiguous write must never trigger credential replay. */
export function sendDeviceCredentials(socket: WebSocket, message: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) return reject(new Error('Device disconnected'));
    socket.send(JSON.stringify(message), (error) => (error ? reject(error) : resolve()));
  });
}
