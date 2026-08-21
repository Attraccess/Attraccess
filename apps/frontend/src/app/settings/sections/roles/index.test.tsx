import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesSection } from './index';

const hoisted = vi.hoisted(() => ({
  locale: 'en',
  roles: [
    {
      id: 1,
      key: 'custom-role',
      name: 'Custom role',
      description: null,
      isSystemManaged: false,
      rolePermissions: [],
      userCount: 0,
    },
  ],
}));

vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRoles: () => ({ data: hoisted.roles, isLoading: false }),
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en, de }: { en: Record<string, unknown>; de: Record<string, unknown> }) => ({
    t: (key: string) => {
      const translations = hoisted.locale === 'de' ? de : en;
      const value = key.split('.').reduce<unknown>((current, part) => {
        if (current && typeof current === 'object' && part in current) {
          return (current as Record<string, unknown>)[part];
        }
        return undefined;
      }, translations);
      return typeof value === 'string' ? value : key;
    },
  }),
}));

vi.mock('../../../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({
    roleName: (role: { name: string }) => role.name,
    roleDescription: (role: { description: string | null }) => role.description ?? '',
  }),
}));

vi.mock('../../components/SettingsSection', () => ({
  SettingsSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock('../../../roles/role-form-drawer', () => ({ RoleFormDrawer: () => null }));
vi.mock('../../../roles/delete-role-modal', () => ({ DeleteRoleModal: () => null }));

describe('RolesSection', () => {
  beforeEach(() => {
    hoisted.locale = 'en';
  });

  it('updates collection row cells when the UI language changes', () => {
    const { rerender } = render(<RolesSection />);
    const sourceChip = () => document.querySelector('[data-cy="role-source-chip-custom-role"]');

    expect(sourceChip()).toHaveTextContent('Custom');

    hoisted.locale = 'de';
    rerender(<RolesSection />);

    expect(sourceChip()).toHaveTextContent('Eigene');
  });
});
