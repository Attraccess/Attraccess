import type { User } from '@attraccess/database-entities';
import {
  registerPluginNotificationCategories,
  unregisterPluginNotificationCategories,
} from '../../notifications/plugin-notification-categories';
import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { getPluginEmailTemplate } from '../../email-template/plugin-email-templates';
import {
  createPluginNotificationsContext,
  PluginNotificationDeps,
  preparePluginNotifications,
} from './plugin-notifications';

describe('plugin notifications context', () => {
  const alice = { id: 1, email: 'a@example.com' } as User;
  const bob = { id: 2, email: 'b@example.com' } as User;
  let deps: jest.Mocked<{
    dispatch: jest.Mock;
    sendPluginEmail: jest.Mock;
    sendPluginTemplate: jest.Mock;
    findUsers: jest.Mock;
  }>;
  let context: ReturnType<typeof createPluginNotificationsContext>;

  beforeEach(() => {
    registerPluginNotificationCategories('booking', [{ id: 'reminder', label: { en: 'Reminder', de: 'Erinnerung' } }]);
    deps = {
      dispatch: jest.fn(async () => undefined),
      sendPluginEmail: jest.fn(async () => undefined),
      sendPluginTemplate: jest.fn(async () => undefined),
      findUsers: jest.fn(),
    };
    deps.findUsers.mockResolvedValue([alice, bob]);
    const resolved: PluginNotificationDeps = {
      dispatcher: { dispatch: deps.dispatch },
      email: { sendPluginEmail: deps.sendPluginEmail, sendPluginTemplate: deps.sendPluginTemplate },
      findUsers: deps.findUsers,
    };
    context = createPluginNotificationsContext('booking', () => resolved);
  });

  afterEach(() => unregisterPluginNotificationCategories('booking'));

  it('dispatches under the namespaced category to the resolved, de-duplicated users', async () => {
    await context.dispatch({
      category: 'reminder',
      recipients: [1, 2, 2],
      title: 'Soon',
      body: 'Your slot starts soon',
      url: '/resources/3',
      severity: 'warning',
      dedupeKey: 'slot-9',
    });

    expect(deps.findUsers).toHaveBeenCalledWith([1, 2]);
    expect(deps.dispatch).toHaveBeenCalledWith({
      category: 'plugin.booking.reminder',
      recipients: [alice, bob],
      title: 'Soon',
      body: 'Your slot starts soon',
      url: '/resources/3',
      severity: 'warning',
      dedupeKey: 'slot-9',
      sendEmail: undefined,
    });
  });

  it('only sends email through the core preference-checked callback when email content is given', async () => {
    await context.dispatch({
      category: 'reminder',
      recipients: [1],
      title: 't',
      body: 'b',
      email: { subject: 'Subject', text: 'Hello' },
    });

    const { sendEmail } = deps.dispatch.mock.calls[0][0];
    expect(deps.sendPluginEmail).not.toHaveBeenCalled();
    await sendEmail(alice);
    expect(deps.sendPluginEmail).toHaveBeenCalledWith(alice, { subject: 'Subject', text: 'Hello' });
  });

  it('rejects categories the plugin did not declare, including other plugins categories', async () => {
    registerPluginNotificationCategories('other', [{ id: 'secret', label: { en: 'S', de: 'S' } }]);
    try {
      await expect(context.dispatch({ category: 'unknown', recipients: [1], title: 't', body: 'b' })).rejects.toThrow(
        /undeclared notification category "unknown"/,
      );
      await expect(context.dispatch({ category: 'secret', recipients: [1], title: 't', body: 'b' })).rejects.toThrow(
        /undeclared/,
      );
      expect(deps.dispatch).not.toHaveBeenCalled();
    } finally {
      unregisterPluginNotificationCategories('other');
    }
  });

  it('rejects a category of another plugin whose name extends this one with a "."', async () => {
    registerPluginNotificationCategories('booking.x', [{ id: 'secret', label: { en: 'S', de: 'S' } }]);
    try {
      // `plugin.booking` + `x.secret` is the key of plugin `booking.x`'s category `secret`.
      await expect(context.dispatch({ category: 'x.secret', recipients: [1], title: 't', body: 'b' })).rejects.toThrow(
        /undeclared/,
      );
      expect(deps.dispatch).not.toHaveBeenCalled();
    } finally {
      unregisterPluginNotificationCategories('booking.x');
    }
  });

  it('does nothing when no recipient exists', async () => {
    deps.findUsers.mockResolvedValue([]);
    await context.dispatch({ category: 'reminder', recipients: [404], title: 't', body: 'b' });
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('sends a declared email template through the preference-checked callback, bound to the plugin', async () => {
    await context.dispatch({
      category: 'reminder',
      recipients: [1],
      title: 't',
      body: 'b',
      email: { template: 'confirmed', variables: { reservation: { id: 4 } } },
    });

    const { sendEmail } = deps.dispatch.mock.calls[0][0];
    expect(deps.sendPluginTemplate).not.toHaveBeenCalled();
    await sendEmail(alice);
    expect(deps.sendPluginTemplate).toHaveBeenCalledWith('booking', alice, 'confirmed', { reservation: { id: 4 } });
    expect(deps.sendPluginEmail).not.toHaveBeenCalled();
  });
});

describe('preparePluginNotifications with email templates', () => {
  const template = {
    id: 'confirmed',
    label: { en: 'Confirmed', de: 'Bestätigt' },
    variables: [],
    subject: '{{t "subject" "Hi"}}',
    body: '<mj-section><mj-column><mj-text>{{t "body" "Body"}}</mj-text></mj-column></mj-section>',
    translations: { de: { subject: 'Hallo', body: 'Inhalt' } },
  };

  it('quarantines a plugin that declares templates without SEND_NOTIFICATIONS', () => {
    expect(() => preparePluginNotifications('booking', [PluginPermission.READ_USERS], [], [template])).toThrow(
      PluginPermissionError,
    );
  });

  it('registers the templates with the categories and removes them again', () => {
    const registration = preparePluginNotifications('booking', [PluginPermission.SEND_NOTIFICATIONS], [], [template]);
    expect(getPluginEmailTemplate('plugin.booking.confirmed')).toBeUndefined();
    registration.register();
    registration.register();
    expect(getPluginEmailTemplate('plugin.booking.confirmed')).toBeDefined();
    registration.unregister();
    expect(getPluginEmailTemplate('plugin.booking.confirmed')).toBeUndefined();
  });

  it.each([
    ['a template without German text', [], [{ ...template, translations: { de: {} } }], /no German translation/],
    ['a template with a Handlebars syntax error', [], [{ ...template, body: '{{#if x}}' }], /not a valid template/],
    ['a malformed category', [{ id: 'Bad Id', label: { en: 'x', de: 'y' } }], [template], /invalid notification/],
  ])('rejects %s while preparing, before anything is registered', (_name, categories, templates, message) => {
    expect(() =>
      preparePluginNotifications('booking', [PluginPermission.SEND_NOTIFICATIONS], categories, templates),
    ).toThrow(message);
    expect(getPluginEmailTemplate('plugin.booking.confirmed')).toBeUndefined();
  });
});
