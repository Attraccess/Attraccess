import { expect, test } from 'vitest';
import { Inbox } from './inbox';

test('a previous ACK cannot satisfy a later action', async () => {
  const inbox = new Inbox<string>();
  inbox.push('ACK');
  const after = inbox.mark();
  const waiting = inbox.wait((message) => message === 'ACK', after, 50);
  inbox.push('unrelated');
  inbox.push('ACK');
  await expect(waiting).resolves.toBe('ACK');
});
test('captures messages arriving before the waiter is installed', async () => {
  const inbox = new Inbox<string>();
  const after = inbox.mark();
  inbox.push('callback');
  await expect(inbox.wait((message) => message === 'callback', after)).resolves.toBe('callback');
});
test('times out rather than accepting only stale messages', async () => {
  const inbox = new Inbox<string>();
  inbox.push('ACK');
  await expect(inbox.wait(() => true, inbox.mark(), 5)).rejects.toThrow('Timed out');
});
test('transport failures reject pending and future waiters', async () => {
  const inbox = new Inbox<string>();
  const waiting = inbox.wait(() => false);
  inbox.fail(new Error('USB disconnected permanently'));
  await expect(waiting).rejects.toThrow('USB disconnected permanently');
  await expect(inbox.wait(() => true)).rejects.toThrow('USB disconnected permanently');
});
