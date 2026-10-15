import { AssuranceFixture } from './fixture';

it('counts malformed operational ingress independently of parser and diagnostics rejections', () => {
  const fixture = new AssuranceFixture();
  fixture.observeOperationalPacket(`${fixture.prefix}/v1/controllers/controller-0/state`, Buffer.from('{invalid'));
  expect(fixture.counts).toMatchObject({ received: 1, protocolRejected: 1, diagnosticsRejected: 0, rejected: 1 });
  fixture.observeOperationalPacket(`${fixture.prefix}/v1/controllers/controller-0/commands`, Buffer.from('{invalid'));
  fixture.observeOperationalPacket('unrelated/state', Buffer.from('{invalid'));
  expect(fixture.counts.received).toBe(1);
});
