import { BadRequestException } from '@nestjs/common';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Acceptance composes the real core manifest validation with the real plugin package.
import { parseNpmPluginPackage } from '../../../api/src/plugin-system/npm/contract-validation';

const read = (path: string) => JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
const matterPackage = read('../package.json');
// A second plugin that supports every 1.x host, standing in for "other plugins".
const otherPlugin = {
  ...read('../../rabbitmq/package.json'),
  attraccess: { ...read('../../rabbitmq/package.json').attraccess, host: '^1.0.0' },
};

describe('Matter plugin host compatibility', () => {
  it('is accepted by a supported host', () => {
    const { manifest } = parseNpmPluginPackage(matterPackage, '1.11.0');
    expect(manifest.name).toBe(matterPackage.name);
    expect(matterPackage.attraccess.host).toBe(COMPATIBILITY_TABLE[0].attraccess);
  });

  it.each(['1.10.0', '1.9.9', '2.0.0'])('is rejected by host %s while core and other plugins keep working', (host) => {
    expect(() => parseNpmPluginPackage(matterPackage, host)).toThrow(BadRequestException);
    expect(() => parseNpmPluginPackage(matterPackage, host)).toThrow(
      `Plugin is not compatible with Attraccess ${host}`,
    );
    // The rejection is a thrown, handled error. Core keeps validating and accepting other plugins afterwards.
    if (host.startsWith('1.')) expect(parseNpmPluginPackage(otherPlugin, host).manifest.name).toBe(otherPlugin.name);
  });
});
