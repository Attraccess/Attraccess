import type { ReservationEntity } from '../../entities/reservation.entity';
import type { ResourceSettings } from '../../settings/settings.model';
import { formatRange, formatTime, minutesText, TimeContext } from '../format';
import type { EmailTemplateId } from './build';

/** Template and variables of one email; the notifier hands it to `notifications.dispatch`. */
export interface EmailRef {
  template: EmailTemplateId;
  variables: Record<string, unknown>;
}

export interface EmailTimeContext extends TimeContext {
  resourceName: string;
}

/**
 * What anyone who can see the resource may know about a booking: the resource and the times (decision 14).
 * Mails to someone other than the holder or a manager get only these, so an admin who adds
 * `{{reservation.note}}` or `{{holder.name}}` to such a template cannot leak the holder's data.
 */
export function slotVariables(
  m: EmailTimeContext,
  r: Pick<ReservationEntity, 'startTime' | 'endTime'>,
): { resource: { name: string }; reservation: Record<string, unknown> } {
  return {
    resource: { name: m.resourceName },
    reservation: {
      when: formatRange(r.startTime, r.endTime, m),
      startTime: formatTime(r.startTime, m),
      endTime: formatTime(r.endTime, m),
    },
  };
}

/** Variables every mail to the holder or a manager shares: the slot plus the booking's own fields. */
export function bookingVariables(
  m: EmailTimeContext,
  r: ReservationEntity,
  options: { viaApproval?: boolean } = {},
): Record<string, unknown> {
  const slot = slotVariables(m, r);
  return {
    resource: slot.resource,
    reservation: {
      id: r.id,
      ...slot.reservation,
      note: r.note ?? '',
      viaApproval: options.viaApproval ?? false,
      // A direct confirmation has no manager comment to quote; approvals and rejections show theirs.
      decisionReason: options.viaApproval === false ? '' : (r.decisionReason ?? ''),
      cancelReason: r.cancelReason ?? '',
    },
  };
}

/** The check-in rules as flags (one paragraph of the template shows per case) plus the written-out minutes. */
export function checkInVariables(
  settings: Pick<ResourceSettings, 'checkInEnabled' | 'checkInGraceMinutes' | 'earlyCheckInMinutes'>,
  lang: TimeContext['lang'],
): Record<string, unknown> {
  const hasEarly = settings.checkInEnabled && settings.earlyCheckInMinutes > 0;
  return {
    off: !settings.checkInEnabled,
    onNoEarly: settings.checkInEnabled && !hasEarly,
    onWithEarly: hasEarly,
    graceText: minutesText(lang, settings.checkInGraceMinutes),
    earlyText: minutesText(lang, settings.earlyCheckInMinutes),
  };
}
