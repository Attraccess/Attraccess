import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { RoleWithUsageDto } from '@attraccess/react-query-client';
import { RoleFormDrawer } from './index';

vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({}) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: () => true, hasPermissionKey: () => true }),
}));

const plugin = (pluginName: string, key: string, label: string, labelDe: string, categoryLabelDe: string) => ({
  key,
  label,
  labelDe,
  description: '',
  descriptionDe: null,
  category: `plugin:${pluginName}`,
  pluginName,
  categoryLabel: pluginName,
  categoryLabelDe,
});

vi.mock('@attraccess/react-query-client', () => ({
  useListRolesKey: 'roles',
  useListPermissions: () => ({
    data: [
      plugin('rabbitmq', 'rabbitmq.broker.read', 'View broker', 'Broker ansehen', 'RabbitMQ (DE)'),
      plugin('matter', 'matter.devices.read', 'View Matter devices', 'Matter-Geräte ansehen', 'Matter (DE)'),
      { key: 'billing.read', label: 'Read Billing', description: '', category: 'billing', pluginName: null },
      { key: 'resources.read', label: 'Read Resources', description: '', category: 'resources', pluginName: null },
    ],
  }),
  useCreateRole: () => ({ mutate: vi.fn() }),
  useUpdateRole: () => ({ mutate: vi.fn() }),
}));

const originalLanguage = useTranslationState.getState().language;
afterEach(() => {
  cleanup();
  useTranslationState.getState().setLanguage(originalLanguage);
});

it('lists plugin categories after the core ones, sorted by plugin name, in the current language', async () => {
  useTranslationState.getState().setLanguage('de');
  const role = {
    id: 1,
    key: 'administrator',
    name: 'Administrator',
    description: '',
    isSystemManaged: true,
    rolePermissions: ['rabbitmq.broker.read', 'matter.devices.read', 'billing.read', 'resources.read'].map(
      (permissionKey) => ({ permissionKey }),
    ),
    userCount: 1,
  } as RoleWithUsageDto;

  render(<RoleFormDrawer isOpen onOpenChange={vi.fn()} role={role} />);

  await screen.findByText('Matter-Geräte ansehen');
  const readonly = document.querySelector('[data-cy="role-form-drawer-readonly-permissions"]') as HTMLElement;
  const headings = [...readonly.querySelectorAll('p')].map((element) => element.textContent);
  expect(headings.slice(-2)).toEqual(['Matter (DE)', 'RabbitMQ (DE)']);
  expect(headings.indexOf('Matter (DE)')).toBeGreaterThan(1);
  expect(screen.getByText('Broker ansehen')).toBeTruthy();
});
