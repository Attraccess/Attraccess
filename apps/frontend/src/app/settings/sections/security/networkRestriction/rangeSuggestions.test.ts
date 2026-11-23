import { describe, expect, it } from 'vitest';
import type { NetworkRestrictionSettingsDto } from '@attraccess/react-query-client';
import { buildRangeSuggestions } from './rangeSuggestions';

const settings = (over: Partial<NetworkRestrictionSettingsDto> = {}) =>
  ({
    detectedAddress: '203.0.113.9',
    detectedSubnet: '203.0.113.0/24',
    serverRanges: ['192.168.50.0/24', '10.0.0.0/8'],
    ...over,
  }) as NetworkRestrictionSettingsDto;

describe('buildRangeSuggestions', () => {
  it('groups the detected subnet and address, the server networks, the private and the local ranges in that order', () => {
    expect(buildRangeSuggestions(settings(), [])).toEqual([
      { key: 'detected', ranges: ['203.0.113.0/24', '203.0.113.9'] },
      { key: 'server', ranges: ['192.168.50.0/24', '10.0.0.0/8'] },
      // 10.0.0.0/8 is offered once, in the first group that has it.
      { key: 'private', ranges: ['172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'] },
      { key: 'local', ranges: ['127.0.0.0/8', '::1/128', '169.254.0.0/16', 'fe80::/10'] },
    ]);
  });

  it('drops empty groups', () => {
    const groups = buildRangeSuggestions(
      settings({ detectedAddress: null, detectedSubnet: null, serverRanges: [] }),
      [],
    );
    expect(groups.map((group) => group.key)).toEqual(['private', 'local']);
  });

  it('drops what the list holds, in any spelling or within a broader range', () => {
    const groups = buildRangeSuggestions(settings(), ['203.0.113.0/25', '203.0.113.9/32', '192.168.0.1/16']);
    expect(groups[0]).toEqual({ key: 'detected', ranges: ['203.0.113.0/24'] });
    expect(groups.flatMap((group) => group.ranges)).not.toContain('192.168.50.0/24');
    expect(groups.flatMap((group) => group.ranges)).not.toContain('192.168.0.0/16');
  });
});
