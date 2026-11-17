import type { User } from '@attraccess/database-entities';

/**
 * The plugin SDK describes an authenticated request user with the neutral PluginUserModel only. The host application
 * runs on the full user record, so it extends the SDK's extension point with it. Plugins compiled against the SDK
 * never see this declaration and cannot reach beyond the neutral fields.
 */
declare module '../../../../../../libs/plugins-backend-sdk/src/lib/auth.types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
  interface AuthenticatedUserExtensions extends User {}
}
