import { WebSocket } from 'ws';
import { ReaderCiphertextStream } from './reader-connection-transport';
import { READER_LIMITS } from './reader-frame';

describe('reader ciphertext queue pressure', () => {
  const socket = () => ({ bufferedAmount: 0, pause: jest.fn(), resume: jest.fn(), send: jest.fn() });
  it('pauses input at the high water mark, resumes on demand and refuses overflow', () => {
    const ws = socket();
    const stream = new ReaderCiphertextStream(ws as unknown as WebSocket);
    while (stream.readableLength < READER_LIMITS.tlsInput) stream.receive(Buffer.alloc(READER_LIMITS.wsMessage));
    expect(ws.pause).toHaveBeenCalled();
    expect(stream.read()).toBeInstanceOf(Buffer);
    stream._read();
    expect(ws.resume).toHaveBeenCalled();
    while (stream.readableLength + READER_LIMITS.wsMessage <= READER_LIMITS.ciphertextQueue)
      stream.receive(Buffer.alloc(READER_LIMITS.wsMessage));
    expect(() => stream.receive(Buffer.alloc(READER_LIMITS.wsMessage))).toThrow('input exceeds limit');
    expect(stream.inputPeak).toBeLessThanOrEqual(READER_LIMITS.ciphertextQueue);
    stream.destroy();
  });
  it('rejects a stalled output queue without writing bytes and propagates write failures', async () => {
    const ws = socket();
    ws.bufferedAmount = READER_LIMITS.ciphertextQueue;
    const stream = new ReaderCiphertextStream(ws as unknown as WebSocket);
    const error = new Promise<Error>((resolve) => stream.once('error', resolve));
    stream.write(Buffer.alloc(1));
    expect((await error).message).toContain('output exceeds limit');
    expect(ws.send).not.toHaveBeenCalled();
    const next = socket();
    next.send.mockImplementation((_bytes, _options, callback) => callback(new Error('network lost')));
    const failed = new ReaderCiphertextStream(next as unknown as WebSocket);
    const failure = new Promise<Error>((resolve) => failed.once('error', resolve));
    failed.write(Buffer.alloc(10));
    expect((await failure).message).toBe('network lost');
    expect(failed.outputPeak).toBe(10);
  });
});
