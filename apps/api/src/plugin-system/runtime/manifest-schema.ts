import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { z } from 'zod';
import { PluginDependenciesSchema } from './dependencies';
/** Sidebar route paths a plugin offers for dashboard pinning: plain segments, never kiosk or the dashboard itself. */
export const dashboardPathsSchema = z.array(
  z.string().regex(/^\/(?!kiosk(?:\/|$)|dashboard(?:\/|$))[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/, {
    message: 'must be a route path of plain segments outside /kiosk and /dashboard',
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
      .extend({ styles: z.string().optional(), dashboardPaths: dashboardPathsSchema.optional() })
      .optional(),
    backend: mainSchema.optional(),
    migrations: mainSchema.optional(),
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
});
