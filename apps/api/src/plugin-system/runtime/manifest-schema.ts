import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { z } from 'zod';
import { PluginDependenciesSchema } from './dependencies';
import { PluginLicenseDeclarationSchema } from '../license/plugin-license';
/**
 * Sidebar route paths a plugin offers for dashboard pinning: plain segments, never kiosk or the dashboard itself.
 * Case-insensitive, because the router matches paths regardless of case.
 */
export const dashboardPathsSchema = z.array(
  z.string().regex(/^\/(?!(?:kiosk|dashboard)(?:\/|$))[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/i, {
    message: 'must be a route path of plain segments outside /kiosk and /dashboard',
  }),
);

/** A dashboard widget id: lowercase kebab-case, at most 64 characters. Pins of widgets are validated with it too. */
export const DASHBOARD_WIDGET_ID_PATTERN = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Dashboard widget ids a plugin contributes through getDashboardWidgets(). */
export const dashboardWidgetsSchema = z.array(
  z.string().regex(DASHBOARD_WIDGET_ID_PATTERN, {
    message: 'must be a lowercase kebab-case widget id of at most 64 characters',
  }),
);

export const mainSchema = z.object({
  directory: z.string(),
  entryPoint: z.string(),
});

export const PluginManifestSchema = z.object({
  dependencies: PluginDependenciesSchema,
  name: z.string(),
  main: z.object({
    frontend: mainSchema
      .extend({
        styles: z.string().optional(),
        dashboardPaths: dashboardPathsSchema.optional(),
        dashboardWidgets: dashboardWidgetsSchema.optional(),
      })
      .optional(),
    backend: mainSchema.optional(),
  }),
  version: z.string(),
  attraccessVersion: z
    .object({
      min: z.string().optional(),
      max: z.string().optional(),
      exact: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.min && data.max) {
          return data.min <= data.max;
        }

        return true;
      },
      { message: 'min must be less than or equal to max' },
    )
    .refine(
      (data) => {
        if (!data.min && !data.max && !data.exact) {
          return false;
        }

        return true;
      },
      { message: 'min, max or exact must be provided' },
    ),
  permissions: z
    .array(z.nativeEnum(PluginPermission, { message: 'unknown plugin permission' }))
    .optional()
    .default([]),
  license: PluginLicenseDeclarationSchema.optional(),
});
