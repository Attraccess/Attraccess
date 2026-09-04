import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

describe('node catalog category translations', () => {
  it('uses the approved English category labels and order', () => {
    expect(en.domains).toEqual({
      'usage-sessions': 'Usage sessions',
      'operation-activity': 'Operation & activity',
      billing: 'Billing',
      'access-doors': 'Access & doors',
      'health-monitoring': 'Health monitoring',
      'companion-device': 'Companion device',
      messaging: 'Messaging',
      'web-requests': 'Web requests',
      'flow-control': 'Flow control',
    });
  });

  it('provides German labels for every approved category', () => {
    expect(Object.keys(de.domains)).toEqual(Object.keys(en.domains));
    expect(Object.values(de.domains)).not.toContain('Ressource');
  });
});
