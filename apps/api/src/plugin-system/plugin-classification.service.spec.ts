import { PluginClassificationService } from './plugin-classification.service';

describe('PluginClassificationService', () => {
  const service = new PluginClassificationService();

  it('recognizes approved packages from their approved registry', () => {
    expect(service.classify('@attraccess-plugins/shelly', 'https://registry.npmjs.org')).toEqual({
      kind: 'official',
      reason: 'Approved Attraccess package source',
    });
  });

  it('does not trust an official package name from a different registry', () => {
    expect(service.classify('@attraccess-plugins/shelly', 'https://registry.example.com').kind).toBe('community');
  });

  it('classifies packages without an approved source as community', () => {
    expect(service.classify('@example/plugin', 'https://registry.npmjs.org').kind).toBe('community');
  });
});
