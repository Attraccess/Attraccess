/**
 * Detects whether an email template body is a full `<mjml>` document rather
 * than an mj-body fragment. Single source of truth shared by the API's
 * fragment validation and the frontend editor's wrap/unwrap logic so the two
 * can't drift apart.
 */
export const isFullMjmlDocument = (value: string): boolean => /^\s*<mjml[\s>]/i.test(value);
