import { ResourceType, UpdateResourceDto } from '@attraccess/react-query-client';
import { ABSOLUTE_LIMIT_MINUTES } from '../../usage/sessionDuration';

type DurationFields = Pick<
  UpdateResourceDto,
  'type' | 'maxSessionDurationMinutes' | 'defaultSessionDurationEstimateMinutes'
>;

/**
 * The translation key of the reason the session duration settings cannot be saved, or null when they can. Doors
 * ignore these settings, so they never block a save there.
 */
export function sessionDurationSettingsError(formData: DurationFields): string | null {
  if (formData.type === ResourceType.DOOR) return null;
  const { maxSessionDurationMinutes: maxMinutes, defaultSessionDurationEstimateMinutes: defaultMinutes } = formData;
  if (!maxMinutes) return null;
  if (maxMinutes > ABSOLUTE_LIMIT_MINUTES) return 'inputs.machine.sessionDuration.maxSessionTime.tooLong';
  if (defaultMinutes && defaultMinutes > maxMinutes) return 'inputs.machine.sessionDuration.defaultEstimate.tooLong';
  return null;
}
