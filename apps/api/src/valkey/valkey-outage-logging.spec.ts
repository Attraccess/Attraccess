import { EventEmitter } from 'node:events';
import { describeValkeyError, logValkeyOutages } from './valkey-outage-logging';

describe('describeValkeyError', () => {
  it('uses the message, then the code, then a fallback', () => {
    expect(describeValkeyError(Object.assign(new Error('NOAUTH'), { code: 'ECONNREFUSED' }))).toBe('NOAUTH');
    expect(describeValkeyError(Object.assign(new Error(''), { code: 'ECONNREFUSED' }))).toBe('ECONNREFUSED');
    expect(describeValkeyError(new Error(''))).toBe('unknown error');
  });
});

describe('logValkeyOutages', () => {
  const messages = { lost: (reason: string) => `lost (${reason})`, reconnected: 'reconnected' };

  it('logs nothing on the first ready without a connected message', () => {
    const client = new EventEmitter();
    const logger = { log: jest.fn(), warn: jest.fn() };
    logValkeyOutages(client, logger, messages);

    client.emit('ready');

    expect(logger.log).not.toHaveBeenCalled();
  });

  it('keeps the outage state per client', () => {
    const first = new EventEmitter();
    const second = new EventEmitter();
    const logger = { log: jest.fn(), warn: jest.fn() };
    logValkeyOutages(first, logger, messages);
    logValkeyOutages(second, logger, messages);

    first.emit('error', new Error('down'));
    second.emit('ready');
    second.emit('error', new Error('down'));

    expect(logger.warn.mock.calls).toEqual([['lost (down)'], ['lost (down)']]);
    expect(logger.log).not.toHaveBeenCalled();
  });
});
