import { PluginApiError } from '@attraccess/plugins-frontend-sdk';

/** The refusals of `WallsService`, whose backend ships in the same plugin; the keys are its exact messages. */
const KNOWN_REFUSALS: Record<string, string> = {
  ResourceNotFoundException: 'form.errors.resourceUnavailable',
  ResourceGroupNotFound: 'form.errors.groupUnavailable',
  'Showing every resource needs access to the whole machine list': 'form.errors.allNeedsWholeList',
};

/** Localised, actionable text for a refused save; any other failure keeps its own message. */
export function describeSaveError(failure: unknown, t: (key: string) => string): string {
  if (failure instanceof PluginApiError && Object.hasOwn(KNOWN_REFUSALS, failure.message)) {
    return t(KNOWN_REFUSALS[failure.message]);
  }
  return failure instanceof Error ? failure.message : String(failure);
}
