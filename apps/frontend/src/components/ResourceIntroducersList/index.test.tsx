import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntroductionRequiredDisplay } from '../../app/resources/usage/components/IntroductionRequiredDisplay';

const query = vi.hoisted(() => ({
  rows: Array.from({ length: 30 }, (_, index) => ({
    userId: index + 1,
    username: `Tutor ${index + 1}`,
    role: 'introducer',
  })),
  load: vi.fn(),
  listeners: new Set<() => void>(),
}));
vi.mock('@attraccess/react-query-client', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    ResourceIntroducerType: { INTRODUCER: 'introducer' },
    useAccessControlServiceResourceIntroducersGetNames: (...args: unknown[]) => {
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
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
    AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
  }))()),
}));

describe('introduction required tutor contacts', () => {
  beforeEach(() => {
    query.rows = Array.from({ length: 30 }, (_, index) => ({
      userId: index + 1,
      username: `Tutor ${index + 1}`,
      role: 'introducer',
    }));
    query.load.mockClear();
  });
  it('renders every tutor and refreshes assignments while the list remains open', () => {
    render(<IntroductionRequiredDisplay resourceId={1} />);
    expect(screen.getByText('needsIntroduction')).toBeInTheDocument();
    for (let i = 1; i <= 30; i++) expect(screen.getByText(`Tutor ${i}`)).toBeInTheDocument();
    expect(query.load).toHaveBeenCalledWith({ resourceId: 1 }, undefined, {
      refetchInterval: 10000,
    });
    act(() => {
      query.rows = [{ userId: 50, username: 'New tutor', role: 'introducer' }];
      query.listeners.forEach((listener) => listener());
    });
    expect(screen.getByText('New tutor')).toBeInTheDocument();
    expect(screen.queryByText('Tutor 30')).not.toBeInTheDocument();
  });
});
