import {
  isLicenseGated,
  missingLicenseReason,
  parseManifestLicense,
  PluginLicenseDeclarationSchema,
  withRequiringPlugins,
} from './plugin-license';
import { PluginManifestSchema } from '../runtime/manifest-schema';

describe('PluginLicenseDeclarationSchema', () => {
  it.each([[{}], [{ required: true }], [{ modules: ['wago'] }], [{ required: true, modules: ['wago'] }]])(
    'accepts %j',
    (license) => {
      expect(PluginLicenseDeclarationSchema.safeParse(license).success).toBe(true);
    },
  );

  it.each([
    [{ required: 'yes' }],
    [{ modules: 'wago' }],
    [{ modules: [1] }],
    [{ modules: [''] }],
    [{ module: ['wago'] }],
  ])('rejects %j', (license) => {
    expect(PluginLicenseDeclarationSchema.safeParse(license).success).toBe(false);
  });

  it('is part of the manifest and optional there', () => {
    const base = {
      name: 'p',
      version: '1.0.0',
      main: {},
      attraccessVersion: { min: '1.0.0' },
    };
    expect(PluginManifestSchema.parse(base).license).toBeUndefined();
    expect(PluginManifestSchema.parse({ ...base, license: { modules: ['wago'] } }).license).toEqual({
      modules: ['wago'],
    });
    expect(() => PluginManifestSchema.parse({ ...base, license: { required: 'x' } })).toThrow();
  });
});

describe('missingLicenseReason', () => {
  const nonProfit = { valid: true, modules: ['attractap', 'sso', 'billing', 'maintenance'] };
  const licensed = { valid: true, modules: ['attractap', 'wago'] };

  it('does not gate plugins without a license block or with an empty one', () => {
    expect(isLicenseGated(undefined)).toBe(false);
    expect(isLicenseGated({})).toBe(false);
    expect(isLicenseGated({ required: false, modules: [] })).toBe(false);
    expect(missingLicenseReason(undefined, null)).toBeNull();
    expect(missingLicenseReason({}, null)).toBeNull();
  });

  it('loads a module plugin only when the license contains every module', () => {
    expect(missingLicenseReason({ modules: ['wago'] }, licensed)).toBeNull();
    expect(missingLicenseReason({ modules: ['wago', 'other'] }, licensed)).toBe('Requires license module: other');
    expect(missingLicenseReason({ modules: ['a', 'b'] }, licensed)).toBe('Requires license modules: a, b');
  });

  it('never satisfies a plugin module with the non-profit license', () => {
    expect(missingLicenseReason({ required: true, modules: ['wago'] }, nonProfit)).toBe(
      'Requires license module: wago',
    );
  });

  it('treats an unknown or invalid license as missing', () => {
    expect(missingLicenseReason({ modules: ['wago'] }, null)).toBe('Requires license module: wago');
    expect(missingLicenseReason({ modules: ['wago'] }, { valid: false, modules: ['wago'] })).toBe(
      'Requires license module: wago',
    );
  });

  it('lets required-only plugins load with any valid license, the non-profit key included', () => {
    expect(missingLicenseReason({ required: true }, nonProfit)).toBeNull();
    expect(missingLicenseReason({ required: true }, licensed)).toBeNull();
    expect(missingLicenseReason({ required: true }, null)).toBe('Requires a valid Attraccess license');
    expect(missingLicenseReason({ required: true }, { valid: false, modules: [] })).toBe(
      'Requires a valid Attraccess license',
    );
  });
});

describe('parseManifestLicense', () => {
  it('passes a missing block through and returns a valid one parsed', () => {
    expect(parseManifestLicense('p', undefined)).toBeUndefined();
    expect(parseManifestLicense('p', { modules: [' wago '] })).toEqual({ modules: ['wago'] });
  });

  it('throws with the plugin name and the offending field for a malformed block', () => {
    expect(() => parseManifestLicense('p', { required: 'yes' })).toThrow(
      /^Plugin p declares an invalid license block \(required: /,
    );
  });
});

describe('withRequiringPlugins', () => {
  const plugin = (name: string, ...requires: string[]) => ({
    name,
    dependencies: requires.map((dependency) => ({ name: dependency, required: true })),
  });

  it('adds every plugin that requires a blocked one, transitively, but not optional dependants', () => {
    const plugins = [
      plugin('c', 'b'),
      plugin('b', 'a'),
      plugin('a'),
      plugin('free'),
      { name: 'optional', dependencies: [{ name: 'a', required: false }] },
    ];
    expect([...withRequiringPlugins(plugins, new Set(['a']))].sort()).toEqual(['a', 'b', 'c']);
    expect(withRequiringPlugins(plugins, new Set())).toEqual(new Set());
  });
});
