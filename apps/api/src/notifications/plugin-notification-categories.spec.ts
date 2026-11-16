import {
  getPluginNotificationCategory,
  listPluginNotificationCategories,
  registerPluginNotificationCategories,
  unregisterPluginNotificationCategories,
} from './plugin-notification-categories';

describe('plugin notification categories', () => {
  const label = { en: 'Reminder', de: 'Erinnerung' };
  afterEach(() => {
    unregisterPluginNotificationCategories('booking');
    unregisterPluginNotificationCategories('other');
  });

  it('namespaces categories as plugin.<pluginName>.<id>', () => {
    registerPluginNotificationCategories('booking', [{ id: 'reminder', label }]);
    expect(getPluginNotificationCategory('plugin.booking.reminder')).toEqual({
      key: 'plugin.booking.reminder',
      pluginName: 'booking',
      id: 'reminder',
      label,
    });
  });

  it('replaces a plugin registration on reload and leaves other plugins untouched', () => {
    registerPluginNotificationCategories('other', [{ id: 'x', label }]);
    registerPluginNotificationCategories('booking', [{ id: 'old', label }]);
    registerPluginNotificationCategories('booking', [{ id: 'new', label }]);
    expect(listPluginNotificationCategories().map((category) => category.key)).toEqual([
      'plugin.other.x',
      'plugin.booking.new',
    ]);
  });

  it.each([
    ['an invalid id', [{ id: 'Bad Id', label }], /invalid notification category id/],
    ['a missing label', [{ id: 'ok', label: { en: 'only' } as never }], /needs label.en and label.de/],
    [
      'a duplicate id',
      [
        { id: 'ok', label },
        { id: 'ok', label },
      ],
      /twice/,
    ],
  ])('rejects %s without registering anything', (_name, categories, message) => {
    expect(() => registerPluginNotificationCategories('booking', categories)).toThrow(message);
    expect(listPluginNotificationCategories()).toEqual([]);
  });
});
