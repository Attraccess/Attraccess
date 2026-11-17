import { ReaderUiSettingsService } from './reader-ui-settings.service';
import { InMemoryReaderUiSettingsStore } from './reader-ui-stores.test-fixture';

describe('ReaderUiSettingsService.widgetToggles', () => {
  function setup(readerEnabled: boolean | null, offRows: { resourceId: number; plugin: string }[]) {
    const store = new InMemoryReaderUiSettingsStore();
    if (readerEnabled !== null) store.readers.set(5, readerEnabled);
    for (const row of offRows) {
      store.plugins.push({ ...row, widgetsEnabled: false, hookFailurePolicy: 'fail-closed' });
    }
    const service = new ReaderUiSettingsService(store, {} as never, {} as never);
    return { service, store };
  }

  it('loads the reader toggle and the switched-off (resource, plugin) pairs in two queries', async () => {
    const { service, store } = setup(true, [{ resourceId: 12, plugin: 'reservations' }]);
    const toggles = await service.widgetToggles(5, [12, 13]);
    expect(toggles.readerEnabled).toBe(true);
    expect([...toggles.disabled]).toEqual(['12|reservations']);
    expect(store.calls).toEqual({ readerRead: 1, listDisabled: 1 });
  });

  it('defaults to on and finds no switched-off pair without resources', async () => {
    const { service } = setup(null, []);
    const toggles = await service.widgetToggles(5, []);
    expect(toggles).toEqual({ readerEnabled: true, disabled: new Set() });
  });

  it('reports a reader with widgets off', async () => {
    const { service } = setup(false, []);
    expect((await service.widgetToggles(5, [1])).readerEnabled).toBe(false);
  });
});
