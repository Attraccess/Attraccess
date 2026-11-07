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

/** Custom email content. The host renders it inside the global email layout. */
export interface PluginNotificationEmail {
  subject: string;
  /** Trusted HTML fragment placed in the layout body. Takes precedence over text. */
  html?: string;
  /** Plain text. Used as the body (HTML-escaped) when html is omitted. */
  text: string;
}

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
  /** When set, an email is sent to recipients whose preferences allow email for the category. */
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
