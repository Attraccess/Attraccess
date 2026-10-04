import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeterNameEditor } from './MeterNameEditor';
import { MetersCard } from './MetersCard';
import en from './en.json';

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  meter: {
    id: 1,
    name: 'Heartbeats',
    creditsPerUnit: 0,
    lifetimeValue: '110',
    latestObservedAt: null,
    session: { latestValue: '10' },
  },
}));

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.has(permission) }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceMeteringServiceListResourceMeters: () => ({ data: [state.meter] }),
  useResourceMeteringServiceCreateResourceMeter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResourceMeteringServiceUpdateResourceMeter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  UseResourceMeteringServiceListResourceMetersKeyFn: () => ['meters'],
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: keyof typeof en) => en[key] }),
  useTranslationState: () => ({ language: 'en' }),
}));

describe('meter permissions', () => {
  beforeEach(() => {
    state.permissions = new Set();
  });

  it('shows lifetime and session readings to a regular user without management controls', () => {
    render(<MetersCard resourceId={7} />);
    expect(screen.getByText('Heartbeats')).toBeInTheDocument();
    expect(screen.getByText('110')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.rename })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.create })).not.toBeInTheDocument();
  });

  it('allows resource editors to create and rename meters without needing billing permission', () => {
    state.permissions.add('resources.update');
    render(<MetersCard resourceId={7} />);
    expect(screen.getByRole('button', { name: en.rename })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.create })).toBeInTheDocument();
  });

  it('hides the shared editor from billing-only managers even when rendered directly', () => {
    state.permissions.add('billing.manage');
    const { container } = render(<MeterNameEditor resourceId={7} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('removes an open editing form when resource editing permission is revoked', () => {
    state.permissions.add('resources.update');
    const { container, rerender } = render(<MeterNameEditor resourceId={7} />);
    fireEvent.click(screen.getByRole('button', { name: en.create }));
    expect(screen.getByRole('textbox', { name: en.name })).toBeInTheDocument();

    state.permissions.delete('resources.update');
    rerender(<MeterNameEditor resourceId={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});
