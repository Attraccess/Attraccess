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

  it('uses the approved German category labels and order', () => {
    expect(de.domains).toEqual({
      'usage-sessions': 'Nutzungssitzungen',
      'operation-activity': 'Betrieb & Aktivität',
      billing: 'Abrechnung',
      'access-doors': 'Zugang & Türen',
      'health-monitoring': 'Zustandsüberwachung',
      'companion-device': 'Companion-Gerät',
      messaging: 'Nachrichten',
      'web-requests': 'Webanfragen',
      'flow-control': 'Ablaufsteuerung',
    });
  });
});
