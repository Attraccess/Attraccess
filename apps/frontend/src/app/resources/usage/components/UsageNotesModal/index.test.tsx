import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { ResourceUsage, ResourceUsageAction } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { UsageNotesModal } from './index';

vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, username: 'operator' } }),
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  AttraccessUser: ({ user, variant }: { user: { username: string }; variant?: string }) => (
    <div data-testid="supervisor-user" data-variant={variant ?? 'full'}>
      {user.username}
    </div>
  ),
  DateTimeDisplay: ({ date }: { date?: string | null }) => <time>{date}</time>,
  useTranslations: () => ({ t: (key: string) => key }),
}));

describe('UsageNotesModal', () => {
  const supervisedSession = {
    id: 1,
    userId: 1,
    startTime: '2026-06-13T10:00:00.000Z',
    endTime: '2026-06-13T11:00:00.000Z',
    usageAction: ResourceUsageAction.USAGE,
    supervisorUser: { id: 2, username: 'supervisor' },
    startNotes: 'Started with supervised NFC flow',
    endNotes: 'Completed supervised session',
  } as ResourceUsage;

  it('shows the full supervisor user in the details drawer', () => {
    render(
      <UsageNotesModal
        isOpen={true}
        onClose={vi.fn()}
        session={supervisedSession}
      />,
    );

    expect(screen.getByTestId('supervisor-user')).toHaveTextContent('supervisor');
    expect(screen.getByTestId('supervisor-user')).toHaveAttribute('data-variant', 'full');
  });

  it('renders notes as static readable panels instead of text areas', () => {
    render(<UsageNotesModal isOpen={true} onClose={vi.fn()} session={supervisedSession} />);

    expect(screen.getByText('Started with supervised NFC flow')).toBeInTheDocument();
    expect(screen.getByText('Completed supervised session')).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
