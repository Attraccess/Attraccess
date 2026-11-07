import type { ReservationEntity } from '../../entities/reservation.entity';
import { DEFAULT_SETTINGS } from '../../settings/settings.model';
import { renderEmail } from '../../testing/email-render.test-utils';
import * as lifecycle from '../messages';
import * as ops from '../messages-ops';
import { EMAIL_TEMPLATES, PLACEHOLDERS } from './build';

const T_KEY = /\{\{t "([^"]+)"/g;
const PLACEHOLDER = /\{(\w+)\}/g;
const keysOf = (source: string) => [...source.matchAll(T_KEY)].map((m) => m[1]);
const defaultOf = (source: string, key: string) => new RegExp(`\\{\\{t "${key}" "([^"]*)"`).exec(source)?.[1] as string;
const placeholders = (text: string) => [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

const m = { lang: 'en' as const, timeZone: 'Europe/Berlin', resourceName: 'Laser' };
const r = {
  id: 7,
  userId: 10,
  resourceId: 1,
  startTime: new Date('2026-06-01T12:00:00Z'),
  endTime: new Date('2026-06-01T13:00:00Z'),
  note: 'Rush',
  decisionReason: 'Fine',
  cancelReason: 'Broken',
} as ReservationEntity;
const settings = { ...DEFAULT_SETTINGS, enabled: true };

/** One call per message builder: the emails the notifier can send. */
const notices = [
  lifecycle.pendingForManagers(m, r, 'Ada'),
  lifecycle.confirmed(m, r, settings, false),
  lifecycle.confirmed(m, r, settings, true),
  lifecycle.rejected(m, r),
  lifecycle.cancelledByManager(m, r),
  lifecycle.endedEarlyByManager(m, r),
  lifecycle.removed(m, r),
  lifecycle.expired(m, r),
  lifecycle.noShow(m, r, settings),
  ops.stillNeeded(m, r),
  ops.reminder24h(m, r, settings),
  ops.maintenanceAffected(m, r, { startTime: r.startTime, endTime: r.endTime, reason: 'Belt' }),
  ops.maintenanceAffected(m, r, { startTime: r.startTime, endTime: null, reason: null }),
  ops.healthUnhealthy(m, r, 'Door open'),
  ops.healthRecovered(m, r),
  ops.handover(m, r.startTime),
  ops.overrunForHolder(m, r),
  ops.overrunForUser(m, r),
  ops.overrideForHolder(m, r, 'Bob'),
  ops.overrideForManagers(m, r, 'Bob', 'Ada'),
];

const paths = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) => paths(child, `${prefix}${key}.`))
    : [prefix.slice(0, -1)];

describe('reservation email templates', () => {
  it('declares every template with a unique id and en and de labels', () => {
    const ids = EMAIL_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of EMAIL_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
      expect(template.label.en && template.label.de).toBeTruthy();
      expect(template.variables).toContain('user.username');
      expect(template.subject.length).toBeLessThanOrEqual(255);
      expect(template.body).not.toMatch(/<mjml/);
    }
  });

  it.each(EMAIL_TEMPLATES.map((template) => [template.id, template] as const))(
    '%s: German covers exactly the English keys and uses the same placeholders',
    (_id, template) => {
      const source = `${template.subject}\n${template.body}`;
      const keys = keysOf(source);
      expect(Object.keys(template.translations.de).sort()).toEqual([...new Set(keys)].sort());
      for (const key of keys) {
        const en = defaultOf(source, key);
        expect(placeholders(template.translations.de[key])).toEqual(placeholders(en));
        for (const name of placeholders(en).filter(() => key !== 'greeting'))
          expect(PLACEHOLDERS).toHaveProperty([name]);
      }
    },
  );

  it('is fed by a notice builder for every template, and each builder provides every variable its template reads', () => {
    expect(new Set(notices.map((notice) => notice.email.template))).toEqual(
      new Set(EMAIL_TEMPLATES.map((template) => template.id)),
    );
    for (const notice of notices) {
      const template = EMAIL_TEMPLATES.find((candidate) => candidate.id === notice.email.template);
      const provided = new Set(paths(notice.email.variables));
      const missing = (template?.variables ?? []).filter(
        (name) => !name.startsWith('user.') && !name.startsWith('host.') && !provided.has(name),
      );
      expect(missing).toEqual([]);
    }
  });

  it('renders every notice in English and German without leftover placeholders or markup errors', () => {
    for (const notice of notices) {
      for (const lang of ['en', 'de'] as const) {
        const mail = renderEmail(notice.email, lang);
        expect(mail.subject).not.toMatch(/[{}]/);
        expect(mail.text).not.toMatch(/\{\w+\}|undefined|\[object/);
        expect(mail.text).toContain('Laser');
        for (const href of mail.hrefs) expect(href).toMatch(/^https:\/\/app\.test\/reservations/);
      }
    }
  });

  it('shows the matching branch of conditional paragraphs', () => {
    const text = (index: number, lang: 'en' | 'de' = 'en') => renderEmail(notices[index].email, lang).text;
    expect(text(1)).toContain('is confirmed');
    expect(text(1)).not.toContain('Comment:');
    expect(text(2)).toContain('was approved');
    expect(text(2)).toContain('Comment: Fine');
    expect(text(11)).toContain('until');
    expect(text(12)).toContain('no end announced yet');
    expect(text(12)).not.toContain('Reason:');
    expect(text(2, 'de')).toContain('wurde genehmigt');
  });
});
