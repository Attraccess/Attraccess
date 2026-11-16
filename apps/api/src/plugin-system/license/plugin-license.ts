import { z } from 'zod';

/**
 * The `license` block of a plugin manifest. `modules` are license modules without which the plugin must not load;
 * a non-empty list implies `required`. `required` alone asks for any valid Attraccess license (non-profit included).
 */
export const PluginLicenseDeclarationSchema = z
  .object({
    required: z.boolean().optional(),
    modules: z.array(z.string().trim().min(1, 'license module keys must not be empty')).optional(),
  })
  .strict();

export type PluginLicenseDeclaration = z.infer<typeof PluginLicenseDeclarationSchema>;

/** What the host knows about the license at startup. `null` means it could not be determined. */
export type PluginLicenseSnapshot = { valid: boolean; modules: string[] } | null;

export function isLicenseGated(license: PluginLicenseDeclaration | undefined): boolean {
  return Boolean(license?.required || license?.modules?.length);
}

/**
 * Returns why the license does not satisfy the declaration, or null when it does (or nothing is declared).
 * An unknown license counts as not satisfied.
 */
export function missingLicenseReason(
  license: PluginLicenseDeclaration | undefined,
  snapshot: PluginLicenseSnapshot,
): string | null {
  if (!isLicenseGated(license)) return null;

  const modules = license?.modules ?? [];
  if (modules.length > 0) {
    const missing = snapshot?.valid ? modules.filter((module) => !snapshot.modules.includes(module)) : modules;
    return missing.length > 0
      ? `Requires license ${missing.length === 1 ? 'module' : 'modules'}: ${missing.join(', ')}`
      : null;
  }

  return snapshot?.valid ? null : 'Requires a valid Attraccess license';
}
