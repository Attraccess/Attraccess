import { wagoFlowPreview } from './preview';

describe('localized WAGO flow previews', () => {
  it('localizes action and missing selections without translating configured names', () => {
    const rows = wagoFlowPreview({ action: 'set', value: false }, 'command', { name: 'Workshop' }, null, {});
    expect(rows.map((row) => row.translations?.de)).toEqual([
      { label: 'Gerät', value: 'Workshop' },
      { label: 'Kanal', value: 'Nicht ausgewählt' },
      { label: 'Aktion', value: 'Ausschalten' },
    ]);
  });
  it('localizes unavailable devices and numeric conditions while retaining zero', () => {
    const rows = wagoFlowPreview(
      { controllerId: 7, channelId: 'meter', category: 'measurement', equals: 0 },
      'wait',
      undefined,
      null,
      {},
    );
    expect(rows.map((row) => row.translations?.de)).toEqual([
      { label: 'Gerät', value: 'Controller 7 (nicht verfügbar)' },
      { label: 'Kanal', value: 'meter (nicht verfügbar)' },
      { label: 'Warten auf', value: 'Messwert = 0 (Rohwert)' },
      { label: 'Zeitlimit', value: '30 s' },
    ]);
  });
});
