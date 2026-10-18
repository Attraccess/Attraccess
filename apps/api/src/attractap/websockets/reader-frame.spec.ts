import { encodeReaderFrame, ReaderFrameDecoder, ReaderFrameType, READER_LIMITS } from './reader-frame';

describe('authenticated reader framing', () => {
  it.each([ReaderFrameType.Json, ReaderFrameType.Ota])('accepts the exact body cap for type %s', (type) => {
    const length = type === ReaderFrameType.Json ? READER_LIMITS.json : READER_LIMITS.ota;
    const messages: Buffer[] = [];
    const decoder = new ReaderFrameDecoder((_, body) => messages.push(Buffer.from(body)));
    const frame = encodeReaderFrame(type, Buffer.alloc(length, 42));
    for (const byte of frame) decoder.push(Buffer.from([byte]));
    expect(messages).toEqual([Buffer.alloc(length, 42)]);
    expect(() => encodeReaderFrame(type, Buffer.alloc(length + 1))).toThrow();
    const header = Buffer.from(frame.subarray(0, 8));
    header.writeUInt32BE(length + 1, 4);
    expect(() => decoder.push(header)).toThrow();
    expect(messages).toHaveLength(1);
  });

  it('handles multiple frames in one TLS read and clears dispatched buffers', () => {
    const messages: string[] = [];
    let retained: Buffer | undefined;
    const decoder = new ReaderFrameDecoder((_, body) => {
      messages.push(body.toString());
      retained = body;
    });
    decoder.push(
      Buffer.concat(['first', '', 'last'].map((s) => encodeReaderFrame(ReaderFrameType.Json, Buffer.from(s)))),
    );
    expect(messages).toEqual(['first', '', 'last']);
    expect(retained).toEqual(Buffer.alloc(4));
  });

  it.each([
    [0, 2],
    [1, ReaderFrameType.Apdu],
    [1, 255],
    [2, 1],
    [3, 1],
  ])('rejects unsupported header byte %s=%s before dispatch', (index, value) => {
    const dispatch = jest.fn();
    const decoder = new ReaderFrameDecoder(dispatch);
    const frame = encodeReaderFrame(ReaderFrameType.Json, Buffer.from('{}'));
    frame[index] = value;
    expect(() => decoder.push(frame)).toThrow();
    expect(dispatch).not.toHaveBeenCalled();
    expect(() => decoder.push(encodeReaderFrame(ReaderFrameType.Json, Buffer.from('{}')))).toThrow();
  });

  it('does not dispatch truncated frames and rejects input after close', () => {
    const dispatch = jest.fn();
    const decoder = new ReaderFrameDecoder(dispatch);
    decoder.push(encodeReaderFrame(ReaderFrameType.Json, Buffer.from('{}')).subarray(0, 9));
    expect(dispatch).not.toHaveBeenCalled();
    decoder.close();
    expect(() => decoder.push(Buffer.from('}'))).toThrow();
  });
});
