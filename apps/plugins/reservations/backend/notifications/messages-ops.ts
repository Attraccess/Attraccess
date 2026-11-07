import type { ReservationEntity } from '../entities/reservation.entity';
import type { ResourceSettings } from '../settings/settings.model';
import { NoticeText, ROUTES, checkInRules, formatDateTime, formatRange, formatTime, pick } from './format';
import type { MessageContext, Span } from './messages';

const when = (m: MessageContext, r: Span) => formatRange(r.startTime, r.endTime, m);

/** 48h before the start: "do you still need this?" with Keep / Cancel deep links (no tokens, no side effects). */
export function stillNeeded(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Do you still need ${resourceName}?`, `Brauchst du ${resourceName} noch?`),
    lines: [
      pick(
        lang,
        `Your booking of ${resourceName} for ${when(m, r)} starts in about two days. Please tell us whether you still need it. If you do not answer, the booking stays.`,
        `Deine Reservierung von ${resourceName} für ${when(m, r)} beginnt in etwa zwei Tagen. Bitte gib uns Bescheid, ob du sie noch brauchst. Ohne Antwort bleibt die Reservierung bestehen.`,
      ),
    ],
    actions: [
      { label: pick(lang, 'Keep booking', 'Reservierung behalten'), path: ROUTES.reservationAction(r.id, 'keep') },
      {
        label: pick(lang, 'Cancel booking', 'Reservierung stornieren'),
        path: ROUTES.reservationAction(r.id, 'cancel'),
      },
    ],
    path: ROUTES.reservation(r.id),
  };
}

export function reminder24h(m: MessageContext, r: ReservationEntity, settings: ResourceSettings): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Reminder: ${resourceName} tomorrow`, `Erinnerung: ${resourceName} morgen`),
    lines: [
      pick(
        lang,
        `You have booked ${resourceName} for ${when(m, r)}.`,
        `Du hast ${resourceName} für ${when(m, r)} reserviert.`,
      ),
      checkInRules(settings, lang),
    ],
    actions: [{ label: pick(lang, 'Open booking', 'Reservierung öffnen'), path: ROUTES.reservation(r.id) }],
    path: ROUTES.reservation(r.id),
  };
}

export interface MaintenanceSpan {
  startTime: Date;
  endTime: Date | null;
  reason: string | null;
}

export function maintenanceAffected(m: MessageContext, r: ReservationEntity, window: MaintenanceSpan): NoticeText {
  const { lang, resourceName } = m;
  const until = window.endTime
    ? pick(lang, ` until ${formatDateTime(window.endTime, m)}`, ` bis ${formatDateTime(window.endTime, m)}`)
    : pick(lang, ' (no end announced yet)', ' (noch ohne angekündigtes Ende)');
  return {
    title: pick(
      lang,
      `Maintenance affects your booking: ${resourceName}`,
      `Wartung betrifft deine Reservierung: ${resourceName}`,
    ),
    lines: [
      pick(
        lang,
        `${resourceName} is in maintenance from ${formatDateTime(window.startTime, m)}${until}. Your booking (${when(m, r)}) overlaps this period and was not cancelled automatically. You may not be able to use the resource.`,
        `${resourceName} befindet sich ab ${formatDateTime(window.startTime, m)}${until} in Wartung. Deine Reservierung (${when(m, r)}) überschneidet sich mit diesem Zeitraum und wurde nicht automatisch storniert. Möglicherweise kannst du die Ressource nicht nutzen.`,
      ),
      ...(window.reason ? [pick(lang, `Reason: ${window.reason}`, `Grund: ${window.reason}`)] : []),
    ],
    actions: [{ label: pick(lang, 'Open booking', 'Reservierung öffnen'), path: ROUTES.reservation(r.id) }],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

export function healthUnhealthy(m: MessageContext, r: ReservationEntity, reason: string | null): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `${resourceName} has a problem`, `${resourceName} hat ein Problem`),
    lines: [
      pick(
        lang,
        `${resourceName} was reported as unhealthy. Your booking (${when(m, r)}) is affected and may not be usable.`,
        `${resourceName} wurde als gestört gemeldet. Deine Reservierung (${when(m, r)}) ist betroffen und kann möglicherweise nicht genutzt werden.`,
      ),
      ...(reason ? [`${pick(lang, 'Details', 'Details')}: ${reason}`] : []),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

export function healthRecovered(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `${resourceName} works again`, `${resourceName} funktioniert wieder`),
    lines: [
      pick(
        lang,
        `${resourceName} is healthy again. Your booking (${when(m, r)}) can go ahead.`,
        `${resourceName} funktioniert wieder. Deine Reservierung (${when(m, r)}) kann stattfinden.`,
      ),
    ],
    path: ROUTES.reservation(r.id),
  };
}

/** To users with a running session shortly before someone else's booking starts. */
export function handover(m: MessageContext, startTime: Date): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `${resourceName} is reserved soon`, `${resourceName} ist bald reserviert`),
    lines: [
      pick(
        lang,
        `${resourceName} is reserved from ${formatTime(startTime, m)}. Please finish and sign out in time.`,
        `${resourceName} ist ab ${formatTime(startTime, m)} reserviert. Bitte beende deine Sitzung rechtzeitig und melde dich ab.`,
      ),
    ],
    severity: 'warning',
  };
}

/** Booking started while another user's session still runs: to the holder. */
export function overrunForHolder(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `${resourceName} is still in use`, `${resourceName} ist noch in Benutzung`),
    lines: [
      pick(
        lang,
        `Your booking of ${resourceName} has started (${when(m, r)}), but another user's session is still running. The session is not ended automatically; the resource should be free shortly.`,
        `Deine Reservierung von ${resourceName} hat begonnen (${when(m, r)}), aber die Sitzung einer anderen Person läuft noch. Die Sitzung wird nicht automatisch beendet; die Ressource sollte in Kürze frei sein.`,
      ),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

/** Booking started while another user's session still runs: to that user. */
export function overrunForUser(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Please finish on ${resourceName}`, `Bitte beende die Nutzung von ${resourceName}`),
    lines: [
      pick(
        lang,
        `${resourceName} is reserved since ${formatTime(r.startTime, m)} until ${formatTime(r.endTime, m)}. Please finish and sign out now; your session is not ended automatically.`,
        `${resourceName} ist seit ${formatTime(r.startTime, m)} bis ${formatTime(r.endTime, m)} reserviert. Bitte beende deine Sitzung jetzt und melde dich ab; sie wird nicht automatisch beendet.`,
      ),
    ],
    severity: 'warning',
  };
}

/** A maintainer started the resource during the holder's booking: to the holder. */
export function overrideForHolder(m: MessageContext, r: ReservationEntity, starterName: string): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(
      lang,
      `${resourceName} was started during your booking`,
      `${resourceName} wurde während deiner Reservierung gestartet`,
    ),
    lines: [
      pick(
        lang,
        `${starterName} (a manager) started ${resourceName} during your booking (${when(m, r)}).`,
        `${starterName} (verwaltende Person) hat ${resourceName} während deiner Reservierung (${when(m, r)}) gestartet.`,
      ),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

/** A maintainer started the resource during someone's booking: to the other managers. */
export function overrideForManagers(
  m: MessageContext,
  r: ReservationEntity,
  starterName: string,
  holderName: string,
): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Override start on ${resourceName}`, `Übersteuerter Start an ${resourceName}`),
    lines: [
      pick(
        lang,
        `${starterName} started ${resourceName} during the booking of ${holderName} (${when(m, r)}).`,
        `${starterName} hat ${resourceName} während der Reservierung von ${holderName} (${when(m, r)}) gestartet.`,
      ),
    ],
    path: ROUTES.manage,
  };
}
