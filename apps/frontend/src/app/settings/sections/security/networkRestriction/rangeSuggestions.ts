import { NetworkRestrictionSettingsDto } from '@attraccess/react-query-client';

export interface RangeSuggestionGroup {
  /** Translation key under `suggestions.` */
  key: 'detected' | 'server' | 'private' | 'local';
  ranges: string[];
}

const PRIVATE = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'];
const LOCAL = ['127.0.0.0/8', '::1/128', 'fe80::/10'];

/** Quick-add suggestions: what was detected for this admin and server, then the usual private ranges. Added ones drop out. */
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
    { key: 'private', ranges: PRIVATE },
    { key: 'local', ranges: LOCAL },
  ];
  const seen = new Set(added);
  return groups
    .map(({ key, ranges }) => ({
      key,
      ranges: ranges.filter((range) => {
        if (seen.has(range)) return false;
        seen.add(range);
        return true;
      }),
    }))
    .filter((group) => group.ranges.length > 0);
}
