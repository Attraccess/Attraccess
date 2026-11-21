import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttraccessUser, getUserInitials } from './AttraccessUser';

describe('AttraccessUser', () => {
  it('names the user popover with the displayed username', async () => {
    render(<AttraccessUser user={{ id: 42, username: 'supervisor', firstName: null, lastName: null }} />);

    fireEvent.click(screen.getByRole('button', { name: /supervisor/i }));

    expect(await screen.findByRole('dialog', { name: 'supervisor' })).toHaveAccessibleName('supervisor');
  });

  it('renders a mini avatar without the username text', () => {
    render(
      <AttraccessUser user={{ id: 42, username: 'supervisor', firstName: null, lastName: null }} variant="mini" />,
    );

    expect(screen.getByText('SU')).toBeInTheDocument();
    expect(screen.queryByText('supervisor')).not.toBeInTheDocument();
  });

  it('renders username and description without a standalone chat icon button', () => {
    const onStartDirectMessage = vi.fn();
    const user = { id: 42, username: 'supervisor', firstName: null, lastName: null };

    render(<AttraccessUser user={user} description="Lab manager" onStartDirectMessage={onStartDirectMessage} />);

    expect(screen.getByText('supervisor')).toBeInTheDocument();
    expect(screen.getByText('Lab manager')).toBeInTheDocument();

    // A single interactive trigger wrapping the user info — no separate standalone chat button
    expect(screen.getByRole('button', { name: /supervisor/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows the display name with the username as secondary text when a name is set', () => {
    render(
      <AttraccessUser user={{ id: 7, username: 'ada', firstName: 'Ada', lastName: 'Lovelace' }} interactive={false} />,
    );
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('shows only the username without a name', () => {
    render(<AttraccessUser user={{ id: 7, username: 'ada', firstName: null, lastName: null }} interactive={false} />);
    expect(screen.getAllByText('ada')).toHaveLength(1);
  });
});

describe('getUserInitials', () => {
  it('uses name initials, a single name, or the first two username characters', () => {
    expect(getUserInitials({ username: 'x', firstName: 'ada', lastName: 'lovelace' })).toBe('AL');
    expect(getUserInitials({ username: 'x', firstName: null, lastName: 'Lovelace' })).toBe('L');
    expect(getUserInitials({ username: 'ada', firstName: ' ', lastName: null })).toBe('AD');
  });
});
