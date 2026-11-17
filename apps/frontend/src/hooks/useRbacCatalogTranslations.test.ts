import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useRbacCatalogTranslations } from './useRbacCatalogTranslations';

describe('useRbacCatalogTranslations', () => {
  // setLanguage writes to the global store — restore it so it can't leak into other tests
  const originalLanguage = useTranslationState.getState().language;
  afterEach(() => useTranslationState.getState().setLanguage(originalLanguage));

  it('translates catalog entries and falls back to the API values', () => {
    useTranslationState.getState().setLanguage('de');
    const { result } = renderHook(() => useRbacCatalogTranslations());

    // Seeded catalog entries are translated by key, ignoring the English API text
    expect(result.current.permissionLabel({ key: 'resources.access.manage', label: 'Manage Resource Access' })).toBe(
      'Ressourcen-Zugriff verwalten',
    );
    expect(result.current.permissionDescription({ key: 'billing.read', description: 'Allows reading billing' })).toBe(
      'Erlaubt das Lesen von Abrechnungsinformationen und Transaktionen',
    );
    expect(result.current.roleName({ key: 'system-admin', name: 'System Administrator' })).toBe('Systemadministrator');

    // Anything not in the catalog (custom roles, plugin permissions) keeps the API value
    expect(result.current.permissionLabel({ key: 'plugin.custom', label: 'Custom Thing' })).toBe('Custom Thing');
    expect(result.current.roleName({ key: 'my-custom-role', name: 'My Custom Role' })).toBe('My Custom Role');

    // No key at all — never build a `roles.undefined.*` lookup
    expect(result.current.roleName({ name: 'Keyless Role' })).toBe('Keyless Role');
    expect(result.current.roleDescription({ description: 'Keyless description' })).toBe('Keyless description');
  });

  it('localizes plugin permissions from the API fields with English and key fallbacks', () => {
    const plugin = {
      key: 'matter.devices.read',
      pluginName: 'matter',
      label: 'View Matter devices',
      labelDe: 'Matter-Geräte ansehen',
      description: 'Shows status',
      descriptionDe: null,
      categoryLabel: 'Matter',
      categoryLabelDe: 'Matter (DE)',
    };
    useTranslationState.getState().setLanguage('de');
    const { result, rerender } = renderHook(() => useRbacCatalogTranslations());

    expect(result.current.permissionLabel(plugin)).toBe('Matter-Geräte ansehen');
    expect(result.current.permissionDescription(plugin)).toBe('Shows status');
    expect(result.current.permissionCategory('plugin:matter', plugin)).toBe('Matter (DE)');
    expect(result.current.permissionLabel({ key: 'acme.thing.read', pluginName: 'acme', label: null })).toBe(
      'acme.thing.read',
    );
    // Without a category label the plugin name names the group
    expect(result.current.permissionCategory('plugin:acme', { key: 'acme.thing.read', pluginName: 'acme' })).toBe(
      'acme',
    );

    useTranslationState.getState().setLanguage('en');
    rerender();
    expect(result.current.permissionLabel(plugin)).toBe('View Matter devices');
    expect(result.current.permissionCategory('plugin:matter', plugin)).toBe('Matter');
  });
});
