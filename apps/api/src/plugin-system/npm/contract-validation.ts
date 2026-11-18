import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import { BadRequestException } from '@nestjs/common';
import * as semver from 'semver';
import {
  assertHostRangeTargetsSdk2,
  assertManifestCompatible,
  assertNoRemovedContract,
  NPM_PACKAGE_FIELDS,
} from '../runtime/plugin-compatibility';
import { z } from 'zod';
import { PluginDependenciesSchema } from '../runtime/dependencies';
import { dashboardPathsSchema, dashboardWidgetsSchema } from '../runtime/manifest-schema';
import { PluginManifest, PluginManifestSchema } from '../plugin.manifest';
import { PluginLicenseDeclarationSchema } from '../license/plugin-license';

const entryPath = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/') && !value.split('/').includes('..'), {
    message: 'must be a relative path without traversal',
  });

const packageSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().refine(semver.valid, 'must be a strict semver version'),
    keywords: z.array(z.string()).default([]),
    peerDependencies: z.record(z.string(), z.string()).default({}),
    repository: z.union([z.string(), z.object({ url: z.string() })]).optional(),
    homepage: z.string().url().optional(),
    license: z.string().optional(),
    author: z.union([z.string(), z.object({ name: z.string().optional() })]).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    attraccess: z.object({
      dependencies: PluginDependenciesSchema,
      displayName: z.string().min(1),
      description: z.string().optional(),
      host: z.string().min(1),
      backend: entryPath.optional(),
      frontend: entryPath.optional(),
      styles: entryPath.optional(),
      dashboardPaths: dashboardPathsSchema.optional(),
      dashboardWidgets: dashboardWidgetsSchema.optional(),
      permissions: z.array(z.nativeEnum(PluginPermission, { message: 'unknown plugin permission' })).default([]),
      // npm installs get a synthesized plugin.json, so the license requirement travels in package.json.
      license: PluginLicenseDeclarationSchema.optional(),
      sdk: z
        .object({
          backend: z.string().optional(),
          frontend: z.string().optional(),
        })
        .default({}),
    }),
  })
  .passthrough();

export type NpmPluginPackage = z.infer<typeof packageSchema>;

export function parseNpmPluginPackage(
  value: unknown,
  hostVersion: string,
): { pkg: NpmPluginPackage; manifest: PluginManifest } {
  refuseRemovedContract(value);
  const pkg = packageSchema.parse(value);
  if (
    Object.keys(pkg.scripts ?? {}).some((name) =>
      ['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly'].includes(name),
    )
  ) {
    throw new BadRequestException('Plugin packages may not define lifecycle scripts');
  }
  if (!pkg.keywords.includes('attraccess-plugin')) {
    throw new BadRequestException('Package must include the attraccess-plugin keyword');
  }
  // The SDK 2.0 check first: an SDK 1.x package gets the message naming it and the migration guide.
  refuseIncompatible(() => assertHostRangeTargetsSdk2(pkg.name, pkg.attraccess.host));
  if (!semver.satisfies(hostVersion, pkg.attraccess.host, { includePrerelease: true })) {
    throw new BadRequestException(`Plugin is not compatible with Attraccess ${hostVersion}`);
  }
  validateSdkPeerDependency(
    pkg,
    '@attraccess/plugins-backend-sdk',
    pkg.attraccess.sdk.backend,
    Boolean(pkg.attraccess.backend),
    hostVersion,
  );
  validateSdkPeerDependency(
    pkg,
    '@attraccess/plugins-frontend-sdk',
    pkg.attraccess.sdk.frontend,
    Boolean(pkg.attraccess.frontend),
    hostVersion,
  );

  const main = {
    ...(pkg.attraccess.backend ? { backend: splitEntry(pkg.attraccess.backend) } : {}),
    ...(pkg.attraccess.frontend
      ? {
          frontend: {
            ...splitEntry(pkg.attraccess.frontend),
            ...(pkg.attraccess.styles
              ? { styles: styleForFrontend(pkg.attraccess.frontend, pkg.attraccess.styles) }
              : {}),
            ...(pkg.attraccess.dashboardPaths ? { dashboardPaths: pkg.attraccess.dashboardPaths } : {}),
            ...(pkg.attraccess.dashboardWidgets ? { dashboardWidgets: pkg.attraccess.dashboardWidgets } : {}),
          },
        }
      : {}),
  };
  if (!main.backend && !main.frontend) {
    throw new BadRequestException('Package must declare a backend or frontend entry point');
  }
  const manifest = PluginManifestSchema.parse({
    name: pkg.name,
    version: pkg.version,
    main,
    attraccessVersion: { min: semver.minVersion(pkg.attraccess.host)?.version, exact: hostVersion },
    permissions: pkg.attraccess.permissions,
    dependencies: pkg.attraccess.dependencies,
    license: pkg.attraccess.license,
  });
  // The SDK 2.0 contract at parse time: before any file move, state row or plugin code load, exactly as a ZIP upload
  // and discovery check it.
  refuseIncompatible(() => assertManifestCompatible(manifest, NPM_PACKAGE_FIELDS));
  return { pkg, manifest };
}

/**
 * The removed SDK 1.x database contract of a raw package.json (`attraccess.permissions`, `attraccess.persistence`,
 * `attraccess.migrations`), refused with the message that names it before the schema's generic errors can hide it.
 */
function refuseRemovedContract(value: unknown): void {
  const root = value as { name?: unknown; attraccess?: Record<string, unknown> } | null;
  if (typeof root !== 'object' || root === null || typeof root.attraccess !== 'object' || root.attraccess === null)
    return;
  const attraccess = root.attraccess;
  refuseIncompatible(() => {
    if (typeof root.name === 'string' && typeof attraccess.host === 'string') {
      assertHostRangeTargetsSdk2(root.name, attraccess.host);
    }
    assertNoRemovedContract(
      typeof root.name === 'string' ? root.name : '',
      {
        permissions: Array.isArray(attraccess.permissions) ? attraccess.permissions : undefined,
        persistence: attraccess.persistence,
        migrations: attraccess.migrations,
      },
      NPM_PACKAGE_FIELDS,
    );
  });
}

/** A host compatibility refusal is the client's problem: answered with 400 and its message (incl. the guide). */
function refuseIncompatible(check: () => void): void {
  try {
    check();
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
}

function validateSdkPeerDependency(
  pkg: NpmPluginPackage,
  name: string,
  declaredRange: string | undefined,
  required: boolean,
  hostVersion: string,
): void {
  if (!required) return;
  const peerRange = pkg.peerDependencies[name];
  if (
    !peerRange ||
    !declaredRange ||
    !semver.validRange(peerRange) ||
    !semver.validRange(declaredRange) ||
    !semver.intersects(peerRange, declaredRange) ||
    !semver.satisfies(hostVersion, peerRange, { includePrerelease: true }) ||
    !semver.satisfies(hostVersion, declaredRange, { includePrerelease: true })
  ) {
    throw new BadRequestException(`Package must declare ${name} as a compatible peer dependency`);
  }
}

function splitEntry(entry: string): { directory: string; entryPoint: string } {
  const parts = entry.split('/');
  const entryPoint = parts.pop() as string;
  return { directory: parts.join('/') || '.', entryPoint };
}

function styleForFrontend(frontendEntry: string, styles: string): string {
  const directory = frontendEntry.split('/').slice(0, -1).join('/');
  if (directory && !styles.startsWith(`${directory}/`)) {
    throw new BadRequestException('Styles entry must be in the frontend entry directory');
  }
  return directory ? styles.slice(directory.length + 1) : styles;
}
