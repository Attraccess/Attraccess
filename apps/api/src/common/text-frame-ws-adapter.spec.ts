import { parseTextFrameEvent } from './text-frame-ws-adapter';

describe('parseTextFrameEvent', () => {
  it('parses a JSON event from a text frame', () => {
    expect(parseTextFrameEvent('{"event":"EVENT","data":{"a":1}}')).toEqual({ event: 'EVENT', data: { a: 1 } });
  });

  it('drops binary frames', () => {
    expect(parseTextFrameEvent(Buffer.from('{"event":"EVENT"}'))).toBeNull();
  });

  it('drops malformed JSON without throwing, so the adapter does not log client input as an error', () => {
    expect(parseTextFrameEvent('{')).toBeNull();
  });

  it('drops JSON that is not an object', () => {
    expect(parseTextFrameEvent('null')).toBeNull();
    expect(parseTextFrameEvent('42')).toBeNull();
  });
});
