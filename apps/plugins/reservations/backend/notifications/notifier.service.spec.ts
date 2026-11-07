import plugin from '../plugin';
import { ReservationEntity } from '../entities/reservation.entity';
import { Harness, createHarness } from '../testing/harness.test-utils';
import { BackgroundServices, createBackgroundServices } from '../testing/background-services.test-utils';
import { NOTIFICATION_CATEGORIES } from './notifier.service';

type Request = {
  category: string;
  recipients: number[];
  title: string;
  body: string;
  url?: string;
  severity?: string;
  dedupeKey: string;
  email: { subject: string; text: string; html: string };
};

describe('ReservationNotifications', () => {
  let h: Harness;
  let p: BackgroundServices;
  const calls = (): Request[] => h.dispatch.mock.calls.map(([request]) => request as Request);
  const load = (id: number) => h.dataSource.getRepository(ReservationEntity).findOneByOrFail({ id });

  beforeEach(async () => {
    h = await createHarness();
    p = createBackgroundServices(h);
    await h.enable(1);
    await h.settings.warmUp();
    p.info.managers.set(1, [10, 98, 99]);
  });
  afterEach(() => h.close());

  it('declares every category it dispatches under, with en and de labels', () => {
    const declared = plugin.notificationCategories ?? [];
    expect(declared.map((c) => c.id)).toEqual(NOTIFICATION_CATEGORIES.map((c) => c.id));
    for (const category of declared) {
      expect(category.id).toMatch(/^[a-z0-9_-]+$/);
      expect(category.label.en).toBeTruthy();
      expect(category.label.de).toBeTruthy();
    }
    expect(new Set(declared.map((c) => c.id)).size).toBe(declared.length);
  });

  describe('pending', () => {
    it('notifies the managers except the holder, each in their language, with times in the plugin timezone', async () => {
      p.info.languages.set(99, 'de');
      const booking = await load((await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:30:00')).id);
      await h.dataSource.getRepository(ReservationEntity).update({ id: booking.id }, { note: '<b>Rush</b> job' });
      await p.notifications.onPending(await load(booking.id));
      const requests = calls();
      expect(requests).toHaveLength(2);
      const en = requests.find((r) => r.recipients.includes(98)) as Request;
      const de = requests.find((r) => r.recipients.includes(99)) as Request;
      expect(en).toMatchObject({ category: 'approvals', recipients: [98], url: '/reservations/manage' });
      expect(en.title).toBe('Booking request for Resource 1');
      expect(en.body).toContain('user10 requested Resource 1 for Mon, 1 Jun 2026, 14:00 CEST – 15:30');
      expect(de.title).toBe('Reservierungsanfrage für Resource 1');
      expect(de.body).toContain('user10 möchte Resource 1 für');
      expect(de.body).toMatch(/14:00 MESZ – 15:30/);
      expect(en.email.html).toContain('&lt;b&gt;Rush&lt;/b&gt; job');
      expect(en.email.html).not.toContain('<b>Rush');
      expect(en.email.text).toContain('Review requests: https://app.test/reservations/manage');
      expect(en.email.subject).toBe(en.title);
    });

    it('writes winter times with CET', async () => {
      h.setNow('2026-01-10T08:00:00Z');
      const booking = await p.book(11, 1, '2026-01-12T12:00:00', '2026-01-12T13:00:00');
      await p.notifications.onPending(await load(booking.id));
      expect(calls()[0].body).toContain('13:00 CET – 14:00');
    });
  });

  describe('confirmation', () => {
    it('is sent exactly once and includes the check-in rules', async () => {
      const booking = await load((await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
      await p.notifications.onConfirmed(booking, { viaApproval: false });
      await p.notifications.onConfirmed(booking, { viaApproval: false });
      expect(calls()).toHaveLength(1);
      expect(calls()[0]).toMatchObject({ category: 'bookings', recipients: [10], url: `/reservations/${booking.id}` });
      expect(calls()[0].email.text).toContain(
        'Check-in is required: start a session on the resource up to 15 minutes before the start or within 15 minutes after the start',
      );
    });

    it('goes through approvals when a manager approved, and quotes the comment', async () => {
      p.info.languages.set(10, 'de');
      const booking = await load((await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
      await h.dataSource.getRepository(ReservationEntity).update({ id: booking.id }, { decisionReason: 'Viel Spaß' });
      await p.notifications.onConfirmed(await load(booking.id), { viaApproval: true });
      expect(calls()[0].category).toBe('approvals');
      expect(calls()[0].title).toBe('Reservierung bestätigt: Resource 1');
      expect(calls()[0].body).toContain('wurde genehmigt');
      expect(calls()[0].body).toContain('Kommentar: Viel Spaß');
      expect(calls()[0].email.text).toContain('Ein Check-in ist erforderlich');
    });
  });

  it('tells holders about rejection, manager cancellation, early end by a manager and removal', async () => {
    const booking = await load((await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
    await h.dataSource
      .getRepository(ReservationEntity)
      .update({ id: booking.id }, { decisionReason: 'no budget', cancelReason: 'maintenance' });
    const fresh = await load(booking.id);
    await p.notifications.onRejected(fresh);
    await p.notifications.onCancelled(fresh, { byUserId: 99, byHolder: false });
    await p.notifications.onEndedEarly(fresh, { byUserId: 99 });
    await p.notifications.onRemoved(fresh, { byUserId: 99 });
    const requests = calls();
    expect(requests.map((r) => r.dedupeKey)).toEqual([
      `reservations:rejected:${booking.id}`,
      `reservations:cancelled:${booking.id}`,
      `reservations:ended:${booking.id}`,
      `reservations:removed:${booking.id}`,
    ]);
    expect(requests[0].body).toContain('Reason: no budget');
    expect(requests[1].body).toContain('Reason: maintenance');
    for (const request of requests) expect(request.recipients).toEqual([10]);
  });

  it('stays quiet about the holder’s own actions', async () => {
    const booking = await load((await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
    await p.notifications.onCancelled(booking, { byUserId: 10, byHolder: true });
    await p.notifications.onEndedEarly(booking, { byUserId: 10 });
    await p.notifications.onRemoved(booking, { byUserId: 10 });
    expect(calls()).toHaveLength(0);
  });

  it('never throws when the host fails to dispatch (at-most-once, reported as false)', async () => {
    h.dispatch.mockRejectedValueOnce(new Error('smtp down'));
    const booking = await load((await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
    await expect(p.notifications.notifyReminder24h(booking)).resolves.toBe(false);
    await expect(p.notifications.notifyReminder24h(booking)).resolves.toBe(true);
  });

  it('omits links when the application URL is not configured', async () => {
    p.info.baseUrl = null;
    const booking = await load((await p.book(10, 1, '2026-06-04T12:00:00', '2026-06-04T13:00:00')).id);
    await p.notifications.notifyStillNeeded(booking);
    expect(calls()[0].email.text).not.toContain('http');
    expect(calls()[0].url).toBe(`/reservations/${booking.id}`);
  });

  it('puts keep/cancel deep links without tokens into the "still needed" mail', async () => {
    const booking = await load((await p.book(10, 1, '2026-06-04T12:00:00', '2026-06-04T13:00:00')).id);
    await p.notifications.notifyStillNeeded(booking);
    expect(calls()[0].email.html).toContain(`href="https://app.test/reservations/${booking.id}?action=keep"`);
    expect(calls()[0].email.html).toContain(`href="https://app.test/reservations/${booking.id}?action=cancel"`);
  });

  it('writes the German no-show and expiry texts', async () => {
    p.info.languages.set(10, 'de');
    const booking = await load((await p.book(10, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
    await p.notifications.notifyNoShow(booking);
    await p.notifications.notifyExpired(booking);
    expect(calls()[0].body).toContain('nicht innerhalb von 15 Minuten');
    // "freigegeben" alone reads like "approved": the title says what happened
    expect(calls()[0].title).toBe('Nicht eingecheckt – Reservierung verfallen: Resource 1');
    expect(calls()[0].body).toContain('ist deshalb verfallen und der Zeitraum wurde für andere freigegeben');
    expect(calls()[1].title).toBe('Reservierungsanfrage abgelaufen: Resource 1');
    expect(calls()[1].body).toContain('weder genehmigt noch abgelehnt');
  });

  it('tells a lingering user since when and until when the resource is reserved', async () => {
    p.info.languages.set(13, 'de');
    const booking = await load((await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
    await p.notifications.notifyOverrun(booking, [12, 13]);
    const toUsers = calls().filter((r) => r.dedupeKey.startsWith('reservations:overrun-user'));
    expect(toUsers.map((r) => r.body)).toEqual([
      expect.stringContaining('Resource 1 has been reserved since 14:00 (until 15:00).'),
      expect.stringContaining('Resource 1 ist seit 14:00 reserviert (bis 15:00).'),
    ]);
  });

  it('override notices go to the holder and to the other managers, never to the starter', async () => {
    const booking = await load((await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
    await p.notifications.notifyOverrideStart(booking, 99);
    const requests = calls();
    expect(requests.map((r) => [r.dedupeKey.split(':')[1], r.recipients])).toEqual([
      ['override', [11]],
      ['override-mgr', [10, 98]],
    ]);
    expect(requests[0].body).toContain('user99 (a manager) started Resource 1');
    expect(requests[1].body).toContain('user99 started Resource 1 during the booking of user11');
  });

  it('overrun and handover texts never name other users', async () => {
    const booking = await load((await p.book(11, 1, '2026-06-01T12:00:00', '2026-06-01T13:00:00')).id);
    await p.notifications.notifyOverrun(booking, [12]);
    await p.notifications.notifyHandover(booking, [12]);
    for (const request of calls()) expect(request.body + request.email.text).not.toMatch(/user1[0-9]/);
    expect(calls().map((r) => r.recipients)).toEqual([[11], [12], [12]]);
  });
});
