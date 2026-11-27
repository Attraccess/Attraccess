import type { PluginUpdatePolicyDto } from '@attraccess/react-query-client';

/** The panel's draft of the policy. A field the admin cleared is null, and the policy cannot be saved then. */
export interface UpdatePolicyForm {
  checksEnabled: boolean;
  automaticUpdates: boolean;
  mode: PluginUpdatePolicyDto['mode'];
  weekdays: number[];
  startMinute: number | null;
  durationMinutes: number | null;
  timeZone: string | null;
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The form for a stored policy. While no time zone was ever chosen, the browser's is filled in. */
export function toUpdatePolicyForm(policy: PluginUpdatePolicyDto): UpdatePolicyForm {
  return {
    checksEnabled: policy.checksEnabled,
    automaticUpdates: policy.automaticUpdates,
    mode: policy.mode,
    ...policy.schedule,
    timeZone: policy.schedule.timeZone ?? browserTimeZone(),
  };
}

export type UpdatePolicyFormErrors = Partial<Record<'weekdays' | 'startMinute' | 'durationMinutes' | 'timeZone', true>>;

/** What the host would refuse: the schedule has to be complete, with at least one weekday while the switch is on. */
export function updatePolicyFormErrors(form: UpdatePolicyForm): UpdatePolicyFormErrors {
  const errors: UpdatePolicyFormErrors = {};
  if (form.automaticUpdates && form.weekdays.length === 0) errors.weekdays = true;
  if (form.startMinute === null) errors.startMinute = true;
  const duration = form.durationMinutes;
  if (duration === null || !Number.isInteger(duration) || duration < 1 || duration > 1440)
    errors.durationMinutes = true;
  if (!form.timeZone) errors.timeZone = true;
  return errors;
}

/** The request body for a form without errors. */
export function toUpdatePolicyBody(form: UpdatePolicyForm, stored: PluginUpdatePolicyDto) {
  return {
    checksEnabled: form.checksEnabled,
    automaticUpdates: form.automaticUpdates,
    mode: form.mode,
    prerelease: stored.prerelease,
    schedule: {
      weekdays: form.weekdays,
      startMinute: form.startMinute as number,
      durationMinutes: form.durationMinutes as number,
      timeZone: form.timeZone,
    },
  };
}
