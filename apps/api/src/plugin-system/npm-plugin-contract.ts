import { BadRequestException } from '@nestjs/common';
import { PluginPermission } from '@attraccess/plugins-backend-sdk';
import * as semver from 'semver';
import { z } from 'zod';
import { PluginManifest, PluginManifestSchema } from './plugin.manifest';

const entryPath = z.string().min(1).refine((value) => !value.startsWith('/') && !value.split('/').includes('..'), {
  message: 'must be a relative path without traversal',
});

const packageSchema = z.object({
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
    displayName: z.string().min(1),
    description: z.string().optional(),
    host: z.string().min(1),
    backend: entryPath.optional(),
    frontend: entryPath.optional(),
    migrations: entryPath.optional(),
    styles: entryPath.optional(),
    permissions: z.array(z.nativeEnum(PluginPermission)).default([]),
    sdk: z.object({
      backend: z.string().optional(),
      frontend: z.string().optional(),
    }).default({}),
  }),
}).passthrough();

export type NpmPluginPackage = z.infer<typeof packageSchema>;

export function parseNpmPluginPackage(value: unknown, hostVersion: string): { pkg: NpmPluginPackage; manifest: PluginManifest } {
  const pkg = packageSchema.parse(value);
  if (Object.keys(pkg.scripts ?? {}).some((name) => ['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly'].includes(name))) {
    throw new BadRequestException('Plugin packages may not define lifecycle scripts');
  }
  if (!pkg.keywords.includes('attraccess-plugin')) {
    throw new BadRequestException('Package must include the attraccess-plugin keyword');
  }
  if (!semver.satisfies(hostVersion, pkg.attraccess.host, { includePrerelease: true })) {
    throw new BadRequestException(`Plugin is not compatible with Attraccess ${hostVersion}`);
  }
  validateSdkPeerDependency(pkg, '@attraccess/plugins-backend-sdk', pkg.attraccess.sdk.backend, Boolean(pkg.attraccess.backend), hostVersion);
  validateSdkPeerDependency(pkg, '@attraccess/plugins-frontend-sdk', pkg.attraccess.sdk.frontend, Boolean(pkg.attraccess.frontend), hostVersion);

  const main = {
    ...(pkg.attraccess.backend ? { backend: splitEntry(pkg.attraccess.backend) } : {}),
    ...(pkg.attraccess.frontend ? { frontend: { ...splitEntry(pkg.attraccess.frontend), ...(pkg.attraccess.styles ? { styles: styleForFrontend(pkg.attraccess.frontend, pkg.attraccess.styles) } : {}) } } : {}),
    ...(pkg.attraccess.migrations ? { migrations: splitEntry(pkg.attraccess.migrations) } : {}),
  };
  if (!main.backend && !main.frontend) {
    throw new BadRequestException('Package must declare a backend or frontend entry point');
  }
  return { pkg, manifest: PluginManifestSchema.parse({ name: pkg.name, version: pkg.version, main, attraccessVersion: { exact: hostVersion }, permissions: pkg.attraccess.permissions }) };
}

function validateSdkPeerDependency(pkg: NpmPluginPackage, name: string, declaredRange: string | undefined, required: boolean, hostVersion: string): void {
  if (!required) return;
  const peerRange = pkg.peerDependencies[name];
  if (!peerRange || !declaredRange || !semver.validRange(peerRange) || !semver.validRange(declaredRange) || !semver.intersects(peerRange, declaredRange) || !semver.satisfies(hostVersion, peerRange, { includePrerelease: true }) || !semver.satisfies(hostVersion, declaredRange, { includePrerelease: true })) {
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
