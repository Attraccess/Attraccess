/** A user-facing label in every supported UI language. */
export interface PluginLocalizedLabel {
  en: string;
  de: string;
}

/**
 * Notification category a plugin declares through
 * {@link PluginBackendModule.notificationCategories}. The host namespaces it as
 * `plugin.<pluginName>.<id>`, lists it in each user's notification preferences
 * under the plugin's name and respects the user's per-channel choice (email, push,
 * in-app toast) whenever the plugin dispatches under it.
 */
export interface PluginNotificationCategory {
  /** Short id, unique within the plugin. Lowercase letters, digits, `-`, `_`. */
  id: string;
  label: PluginLocalizedLabel;
}

/**
 * Email template a plugin declares through {@link PluginBackendModule.emailTemplates}. It works like a core
 * template: the host stores it per installation (key `plugin.<pluginName>.<id>`), lists it in the admin email
 * template editor under the plugin's name, renders it inside the global layout, and admins can edit subject,
 * body and translations. The declaration only seeds it: an installed template is never overwritten.
 *
 * Texts use the template translation helper, `{{t "key" "English default" name=user.username}}`; the English
 * default is inline and `translations.de` carries the German texts (every key used must be present).
 */
export interface PluginEmailTemplate {
  /** Short id, unique within the plugin. Lowercase letters, digits, `-`, `_`. */
  id: string;
  /** Name in the template list. */
  label: PluginLocalizedLabel;
  /** Variables the editor offers, e.g. `reservation.startTime`. `user.*`, `host.*` and `url` are always set. */
  variables: string[];
  /** Subject: a Handlebars string, usually one `t` call. */
  subject: string;
  /** Body: an MJML fragment without an `<mjml>` root (the host wraps it in the global layout). */
  body: string;
  /** Shipped translations per locale. `de` is required and must cover every `t` key of subject and body. */
  translations: { de: Record<string, string> } & Record<string, Record<string, string>>;
}

/** Sends one of the plugin's {@link PluginEmailTemplate}s with these variables (merged under `user`/`host`/`url`). */
export interface PluginNotificationEmailTemplate {
  /** Short id of a template declared by this plugin via `emailTemplates`. */
  template: string;
  variables: Record<string, unknown>;
}

/** Custom email content. The host renders it inside the global email layout. */
export interface PluginNotificationRawEmail {
  subject: string;
  /** Trusted HTML fragment placed in the layout body. Takes precedence over text. */
  html?: string;
  /** Plain text. Used as the body (HTML-escaped) when html is omitted. */
  text: string;
}

/** Prefer a template: admins cannot edit raw content. */
export type PluginNotificationEmail = PluginNotificationRawEmail | PluginNotificationEmailTemplate;

export interface PluginNotificationRequest {
  /** Short id of a category declared by this plugin via `notificationCategories`. */
  category: string;
  /** User ids to notify. Unknown ids are skipped; duplicates are collapsed. */
  recipients: number[];
  title: string;
  body: string;
  /** In-app link target (relative to the application URL, e.g. `/resources/3`). */
  url?: string;
  severity?: 'info' | 'warning';
  /** Collapses repeated push notifications that share the key. */
  dedupeKey?: string;
  /** When set, an email is sent to recipients whose preferences allow email for the category. A template is rendered in each recipient's language. */
  email?: PluginNotificationEmail;
}

/** Notification dispatch for plugins. Requires the SEND_NOTIFICATIONS permission. */
export interface PluginNotificationsContext {
  /**
   * Dispatch a notification to users, honouring each user's channel preferences for the category.
   * Rejects when the category was not declared by this plugin.
   */
  dispatch(request: PluginNotificationRequest): Promise<void>;
}
