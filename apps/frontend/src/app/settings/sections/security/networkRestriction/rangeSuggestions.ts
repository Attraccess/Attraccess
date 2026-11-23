import { NETWORK_RESTRICTION_LOCAL_RANGES, NETWORK_RESTRICTION_PRIVATE_RANGES } from '@attraccess/application-models';
import { NetworkRestrictionSettingsDto } from '@attraccess/react-query-client';
import { isCoveredBy } from './networkRange';

export interface RangeSuggestionGroup {
  /** Translation key under `suggestions.` */
  key: 'detected' | 'server' | 'private' | 'local';
  ranges: string[];
}

/**
 * Quick-add suggestions: what was detected for this admin and server, then the usual private and local ranges. A
 * suggestion that the list (or an earlier group) already holds, however it is spelled, drops out.
 */
export function buildRangeSuggestions(
  settings: NetworkRestrictionSettingsDto,
  added: readonly string[],
): RangeSuggestionGroup[] {
  const detected = [settings.detectedSubnet, settings.detectedAddress].filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );
  const groups: RangeSuggestionGroup[] = [
    { key: 'detected', ranges: detected },
    { key: 'server', ranges: settings.serverRanges ?? [] },
    { key: 'private', ranges: [...NETWORK_RESTRICTION_PRIVATE_RANGES] },
    { key: 'local', ranges: [...NETWORK_RESTRICTION_LOCAL_RANGES] },
  ];
  const taken = [...added];
  const offered: string[] = [];
  return groups
    .map(({ key, ranges }) => ({
      key,
      ranges: ranges.filter((range) => {
        // A broader entry in the list already holds the suggestion; one offered above is not offered twice.
        if (isCoveredBy(taken, range) || offered.includes(range)) return false;
        offered.push(range);
        return true;
      }),
    }))
    .filter((group) => group.ranges.length > 0);
}
