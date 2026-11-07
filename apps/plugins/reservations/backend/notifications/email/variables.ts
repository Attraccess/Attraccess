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

/** Variables every booking mail shares: the resource and the booking, times in the plugin timezone. */
export function bookingVariables(
  m: EmailTimeContext,
  r: ReservationEntity,
  options: { viaApproval?: boolean } = {},
): Record<string, unknown> {
  return {
    resource: { name: m.resourceName },
    reservation: {
      id: r.id,
      when: formatRange(r.startTime, r.endTime, m),
      startTime: formatTime(r.startTime, m),
      endTime: formatTime(r.endTime, m),
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
