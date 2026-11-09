import { PluginClassificationService } from './plugin-classification.service';

describe('PluginClassificationService', () => {
  const service = new PluginClassificationService();

  it('recognizes Attraccess plugin packages published on npm', () => {
    expect(service.classify('@attraccess/plugin-example', 'https://registry.npmjs.org')).toEqual({
      kind: 'official',
      reason: 'Published by Attraccess on npm',
    });
  });

  it('does not trust an official package name from a different registry', () => {
    expect(service.classify('@attraccess/plugin-example', 'https://registry.example.com').kind).toBe('community');
  });

  it('does not trust a lookalike scope', () => {
    expect(service.classify('@attraccess-example/plugin-example', 'https://registry.npmjs.org').kind).toBe('community');
  });

  it('classifies non-plugin packages in the official scope as community', () => {
    expect(service.classify('@attraccess/plugins-backend-sdk', 'https://registry.npmjs.org').kind).toBe('community');
  });

  it('classifies packages outside the official plugin namespace as community', () => {
    expect(service.classify('@example/plugin', 'https://registry.npmjs.org').kind).toBe('community');
  });
});
