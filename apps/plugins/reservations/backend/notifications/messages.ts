import type { ReservationEntity } from '../entities/reservation.entity';
import type { ResourceSettings } from '../settings/settings.model';
import { NoticeText, ROUTES, TimeContext, checkInRules, formatRange, formatTime, minutesText, pick } from './format';

/** Everything a text needs besides the reservation itself. */
export interface MessageContext extends TimeContext {
  resourceName: string;
}

export type Span = Pick<ReservationEntity, 'startTime' | 'endTime'>;

const when = (m: MessageContext, r: Span) => formatRange(r.startTime, r.endTime, m);

/** Managers: a booking waits for approval. */
export function pendingForManagers(m: MessageContext, r: ReservationEntity, holderName: string): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Booking request for ${resourceName}`, `Reservierungsanfrage für ${resourceName}`),
    lines: [
      pick(
        lang,
        `${holderName} requested ${resourceName} for ${when(m, r)}. Please approve or reject the request.`,
        `${holderName} möchte ${resourceName} für ${when(m, r)} reservieren. Bitte genehmige oder lehne die Anfrage ab.`,
      ),
      ...(r.note ? [pick(lang, `Note: ${r.note}`, `Hinweis: ${r.note}`)] : []),
    ],
    actions: [{ label: pick(lang, 'Review requests', 'Anfragen prüfen'), path: ROUTES.manage }],
    path: ROUTES.manage,
  };
}

/** Holder: confirmation (directly, or after approval) including the check-in rules. */
export function confirmed(
  m: MessageContext,
  r: ReservationEntity,
  settings: ResourceSettings,
  viaApproval: boolean,
): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Booking confirmed: ${resourceName}`, `Reservierung bestätigt: ${resourceName}`),
    lines: [
      viaApproval
        ? pick(
            lang,
            `Your booking of ${resourceName} for ${when(m, r)} was approved.`,
            `Deine Reservierung von ${resourceName} für ${when(m, r)} wurde genehmigt.`,
          )
        : pick(
            lang,
            `Your booking of ${resourceName} for ${when(m, r)} is confirmed.`,
            `Deine Reservierung von ${resourceName} für ${when(m, r)} ist bestätigt.`,
          ),
      ...(viaApproval && r.decisionReason
        ? [pick(lang, `Comment: ${r.decisionReason}`, `Kommentar: ${r.decisionReason}`)]
        : []),
      checkInRules(settings, lang),
    ],
    actions: [{ label: pick(lang, 'Open booking', 'Reservierung öffnen'), path: ROUTES.reservation(r.id) }],
    path: ROUTES.reservation(r.id),
  };
}

export function rejected(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Booking rejected: ${resourceName}`, `Reservierung abgelehnt: ${resourceName}`),
    lines: [
      pick(
        lang,
        `Your booking request for ${resourceName} (${when(m, r)}) was rejected.`,
        `Deine Reservierungsanfrage für ${resourceName} (${when(m, r)}) wurde abgelehnt.`,
      ),
      ...(r.decisionReason ? [pick(lang, `Reason: ${r.decisionReason}`, `Grund: ${r.decisionReason}`)] : []),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

export function cancelledByManager(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Booking cancelled: ${resourceName}`, `Reservierung storniert: ${resourceName}`),
    lines: [
      pick(
        lang,
        `Your booking of ${resourceName} (${when(m, r)}) was cancelled by a manager.`,
        `Deine Reservierung von ${resourceName} (${when(m, r)}) wurde von einer verwaltenden Person storniert.`,
      ),
      ...(r.cancelReason ? [pick(lang, `Reason: ${r.cancelReason}`, `Grund: ${r.cancelReason}`)] : []),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

export function endedEarlyByManager(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Booking ended early: ${resourceName}`, `Reservierung vorzeitig beendet: ${resourceName}`),
    lines: [
      pick(
        lang,
        `A manager ended your running booking of ${resourceName}. It now ends at ${formatTime(r.endTime, m)}.`,
        `Eine verwaltende Person hat deine laufende Reservierung von ${resourceName} vorzeitig beendet. Sie endete um ${formatTime(r.endTime, m)}.`,
      ),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

/** Reservations were switched off for the resource; future bookings were cancelled. */
export function removed(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Booking removed: ${resourceName}`, `Reservierung entfernt: ${resourceName}`),
    lines: [
      pick(
        lang,
        `Reservations were switched off for ${resourceName}, so your booking (${when(m, r)}) was cancelled.`,
        `Reservierungen wurden für ${resourceName} deaktiviert, daher wurde deine Reservierung (${when(m, r)}) storniert.`,
      ),
    ],
    severity: 'warning',
  };
}

/** Pending request that nobody decided before its start. */
export function expired(m: MessageContext, r: ReservationEntity): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(lang, `Booking request expired: ${resourceName}`, `Reservierungsanfrage abgelaufen: ${resourceName}`),
    lines: [
      pick(
        lang,
        `Your request for ${resourceName} (${when(m, r)}) was not decided before it started and has expired.`,
        `Deine Anfrage für ${resourceName} (${when(m, r)}) wurde vor dem Beginn weder genehmigt noch abgelehnt und ist abgelaufen.`,
      ),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}

export function noShow(m: MessageContext, r: ReservationEntity, settings: ResourceSettings): NoticeText {
  const { lang, resourceName } = m;
  return {
    title: pick(
      lang,
      `Not checked in – booking released: ${resourceName}`,
      `Nicht eingecheckt – Reservierung verfallen: ${resourceName}`,
    ),
    lines: [
      pick(
        lang,
        `You did not check in within ${minutesText(lang, settings.checkInGraceMinutes)} after the start of your booking of ${resourceName} (${when(m, r)}). The booking was released as a no-show.`,
        `Du hast dich nicht innerhalb von ${minutesText(lang, settings.checkInGraceMinutes)} nach dem Beginn deiner Reservierung von ${resourceName} (${when(m, r)}) eingecheckt. Die Reservierung ist deshalb verfallen und der Zeitraum wurde für andere freigegeben.`,
      ),
    ],
    path: ROUTES.reservation(r.id),
    severity: 'warning',
  };
}
