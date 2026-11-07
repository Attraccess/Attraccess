import type { PluginNotificationEmail } from '@attraccess/plugins-backend-sdk';
import type { ResourceSettings } from '../settings/settings.model';
import type { Lang } from './host-info.service';

/** Frontend routes of the plugin, used for in-app links and email deep links. */
export const ROUTES = {
  mine: '/reservations',
  manage: '/reservations/manage',
  reservation: (id: number) => `/reservations/${id}`,
  /** Deep links of the "still needed" mail. GET has no side effects; the page asks before it acts. */
  reservationAction: (id: number, action: 'keep' | 'cancel') => `/reservations/${id}?action=${action}`,
};

export const pick = (lang: Lang, en: string, de: string): string => (lang === 'de' ? de : en);

const LOCALES: Record<Lang, string> = { en: 'en-GB', de: 'de-DE' };

const dateTimeFormat = (lang: Lang, timeZone: string) =>
  new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });

const timeFormat = (lang: Lang, timeZone: string) =>
  new Intl.DateTimeFormat(LOCALES[lang], { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const dayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/** Where and how times are written: always the plugin timezone, in the recipient's language. */
export interface TimeContext {
  lang: Lang;
  timeZone: string;
}

/** `Mon, 1 Jun 2026, 14:00 CEST` */
export function formatDateTime(date: Date, { lang, timeZone }: TimeContext): string {
  return dateTimeFormat(lang, timeZone).format(date);
}

/** `14:00` */
export function formatTime(date: Date, { lang, timeZone }: TimeContext): string {
  return timeFormat(lang, timeZone).format(date);
}

/** Full start, and only the end time when it falls on the same local day. */
export function formatRange(start: Date, end: Date, time: TimeContext): string {
  const sameDay = dayKey(start, time.timeZone) === dayKey(end, time.timeZone);
  return `${formatDateTime(start, time)} – ${sameDay ? formatTime(end, time) : formatDateTime(end, time)}`;
}

/** Check-in rules paragraph used in the confirmation and the 24h reminder. */
/** "1 minute" / "15 minutes" (en), "1 Minute" / "15 Minuten" (de). */
export function minutesText(lang: Lang, count: number): string {
  return lang === 'de'
    ? `${count} ${count === 1 ? 'Minute' : 'Minuten'}`
    : `${count} ${count === 1 ? 'minute' : 'minutes'}`;
}

export function checkInRules(
  settings: Pick<ResourceSettings, 'checkInEnabled' | 'checkInGraceMinutes' | 'earlyCheckInMinutes'>,
  lang: Lang,
): string {
  if (!settings.checkInEnabled) {
    return pick(
      lang,
      'Check-in is not required: the booking stays yours until it ends, even if you do not start a session.',
      'Ein Check-in ist nicht erforderlich: Die Reservierung bleibt bis zum Ende bei dir, auch wenn du keine Sitzung startest.',
    );
  }
  const early = settings.earlyCheckInMinutes;
  const grace = settings.checkInGraceMinutes;
  return pick(
    lang,
    `Check-in is required: start a session on the resource ${early > 0 ? `up to ${minutesText(lang, early)} before the start or ` : ''}within ${minutesText(lang, grace)} after the start. Without a check-in the booking is released as a no-show.`,
    `Ein Check-in ist erforderlich: Starte ${early > 0 ? `bis zu ${minutesText(lang, early)} vor dem Beginn oder ` : ''}innerhalb von ${minutesText(lang, grace)} nach dem Beginn eine Sitzung an der Ressource. Ohne Check-in verfällt die Reservierung und der Zeitraum wird für andere freigegeben.`,
  );
}

export interface NoticeAction {
  label: string;
  path: string;
}

/** Language-neutral shape every message builder returns. */
export interface NoticeText {
  title: string;
  /** Paragraphs; joined with blank lines in the email and with line breaks in the in-app body. */
  lines: string[];
  actions?: NoticeAction[];
  /** In-app link (relative). */
  path?: string;
  severity?: 'info' | 'warning';
}

export interface RenderedNotice {
  title: string;
  body: string;
  url?: string;
  severity?: 'info' | 'warning';
  email: PluginNotificationEmail;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turns a notice into dispatch content. Links need the public base URL; without one only the in-app link remains. */
export function renderNotice(notice: NoticeText, baseUrl: string | null): RenderedNotice {
  const links = baseUrl ? (notice.actions ?? []).map((a) => ({ label: a.label, url: `${baseUrl}${a.path}` })) : [];
  const text = [...notice.lines, ...links.map((link) => `${link.label}: ${link.url}`)].join('\n\n');
  const html = [
    ...notice.lines.map((line) => `<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`),
    ...(links.length
      ? [`<p>${links.map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`).join(' &middot; ')}</p>`]
      : []),
  ].join('');
  return {
    title: notice.title,
    body: notice.lines.join('\n'),
    url: notice.path,
    severity: notice.severity,
    email: { subject: notice.title, text, html },
  };
}
