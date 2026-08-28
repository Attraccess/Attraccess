import { PluginClassificationService } from './plugin-classification.service';

describe('PluginClassificationService', () => {
  const service = new PluginClassificationService();

  it('recognizes Attraccess plugin packages published on npm', () => {
    expect(service.classify('@attraccess/plugin-shelly', 'https://registry.npmjs.org', 'attraccess')).toEqual({
      kind: 'official',
      reason: 'Published by Attraccess on npm',
    });
  });

  it('does not trust an official package name from a different registry', () => {
    expect(service.classify('@attraccess/plugin-shelly', 'https://registry.example.com', 'attraccess').kind).toBe(
      'community',
    );
  });

  it('rejects a plugin package whose publisher does not match', () => {
    expect(service.classify('@attraccess/plugin-shelly', 'https://registry.npmjs.org', 'someone-else').kind).toBe(
      'community',
    );
  });

  it('rejects a plugin package when the registry does not expose a publisher', () => {
    expect(service.classify('@attraccess/plugin-rabbitmq', 'https://registry.npmjs.org').kind).toBe('community');
  });

  it('classifies packages outside the official plugin namespace as community', () => {
    expect(service.classify('@example/plugin', 'https://registry.npmjs.org').kind).toBe('community');
  });
});
