import { In } from 'typeorm';
import { ReaderUiSettingsService } from './reader-ui-settings.service';

describe('ReaderUiSettingsService.widgetToggles', () => {
  function setup(readerRow: unknown, offRows: unknown[]) {
    const plugins = { find: jest.fn().mockResolvedValue(offRows) };
    const readers = { findOne: jest.fn().mockResolvedValue(readerRow) };
    const service = new ReaderUiSettingsService(
      {} as never,
      plugins as never,
      readers as never,
      {} as never,
      {} as never,
    );
    return { service, plugins, readers };
  }

  it('loads the reader toggle and the switched-off (resource, plugin) pairs in two queries', async () => {
    const { service, plugins, readers } = setup({ readerId: 5, widgetsEnabled: true }, [
      { resourceId: 12, plugin: 'reservations', widgetsEnabled: false },
    ]);
    const toggles = await service.widgetToggles(5, [12, 13]);
    expect(toggles.readerEnabled).toBe(true);
    expect([...toggles.disabled]).toEqual(['12|reservations']);
    expect(readers.findOne).toHaveBeenCalledTimes(1);
    expect(plugins.find).toHaveBeenCalledTimes(1);
    expect(plugins.find).toHaveBeenCalledWith({ where: { resourceId: In([12, 13]), widgetsEnabled: false } });
  });

  it('defaults to on and skips the plugin query without resources', async () => {
    const { service, plugins } = setup(null, []);
    const toggles = await service.widgetToggles(5, []);
    expect(toggles).toEqual({ readerEnabled: true, disabled: new Set() });
    expect(plugins.find).not.toHaveBeenCalled();
  });

  it('reports a reader with widgets off', async () => {
    const { service } = setup({ readerId: 5, widgetsEnabled: false }, []);
    expect((await service.widgetToggles(5, [1])).readerEnabled).toBe(false);
  });
});
