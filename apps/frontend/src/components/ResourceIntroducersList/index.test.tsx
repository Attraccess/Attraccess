import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntroductionRequiredDisplay } from '../../app/resources/usage/components/IntroductionRequiredDisplay';

const query = vi.hoisted(() => ({
  rows: Array.from({ length: 30 }, (_, index) => ({ id: index + 1, user: { username: `Tutor ${index + 1}` } })),
  load: vi.fn(),
  listeners: new Set<() => void>(),
}));
vi.mock('@attraccess/react-query-client', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    ResourceIntroducerType: { INTRODUCER: 'introducer' },
    useAccessControlServiceResourceIntroducersGetMany: (...args: unknown[]) => {
      query.load(...args);
      const data = useSyncExternalStore(
        (listener) => {
          query.listeners.add(listener);
          return () => {
            query.listeners.delete(listener);
          };
        },
        () => query.rows,
      );
      return { data, isLoading: false };
    },
  };
});
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
}));

describe('introduction required tutor contacts', () => {
  beforeEach(() => {
    query.rows = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      user: { username: `Tutor ${index + 1}` },
    }));
    query.load.mockClear();
  });
  it('renders every tutor and refreshes assignments while the list remains open', () => {
    render(<IntroductionRequiredDisplay resourceId={1} />);
    expect(screen.getByText('needsIntroduction')).toBeInTheDocument();
    for (let i = 1; i <= 30; i++) expect(screen.getByText(`Tutor ${i}`)).toBeInTheDocument();
    expect(query.load).toHaveBeenCalledWith({ resourceId: 1, type: 'introducer' }, undefined, {
      refetchInterval: 10000,
    });
    act(() => {
      query.rows = [{ id: 50, user: { username: 'New tutor' } }];
      query.listeners.forEach((listener) => listener());
    });
    expect(screen.getByText('New tutor')).toBeInTheDocument();
    expect(screen.queryByText('Tutor 30')).not.toBeInTheDocument();
  });
});
