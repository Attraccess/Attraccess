import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import ipaddr from 'ipaddr.js';
export const REGISTRY_PARENT = 'plugin-registry';
export const REGISTRIES_KEY = 'registries';
export const MAX_METADATA_BYTES = 10 * 1024 * 1024;

export const MAX_CONFIGURED_REGISTRIES = 5;

export type StoredRegistry = { id: string; name: string; url: string };
export type Registry = StoredRegistry & { token: string | null };
export type PackageVersion = { version: string; dist: { tarball: string; integrity?: string; shasum?: string } };
export function normalizeRegistryUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Registry URL must use HTTP(S)');
  return url.toString().replace(/\/$/, '');
}
export function zodRegistries(value: unknown): StoredRegistry[] {
  if (!Array.isArray(value)) throw new Error();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error();
    const item = entry as StoredRegistry;
    return { id: item.id, name: item.name, url: normalizeRegistryUrl(item.url) };
  });
}
export async function validateRegistryDestination(
  url: URL,
  registry: Registry,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  if (
    url.protocol !== new URL(registry.url).protocol ||
    url.host !== new URL(registry.url).host ||
    url.username ||
    url.password
  )
    throw new BadRequestException('Tarball URL must use the configured registry origin');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => ipaddr.parse(address).range() !== 'unicast'))
    throw new BadRequestException('Tarball URL must resolve only to public addresses');
  return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}
