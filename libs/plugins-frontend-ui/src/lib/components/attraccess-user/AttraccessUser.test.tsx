import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttraccessUser } from './AttraccessUser';

describe('AttraccessUser', () => {
  it('renders a mini avatar without the username text', () => {
    render(<AttraccessUser user={{ id: 42, username: 'supervisor' }} variant="mini" />);

    expect(screen.getByText('SU')).toBeInTheDocument();
    expect(screen.queryByText('supervisor')).not.toBeInTheDocument();
  });

  it('renders username and description without a standalone chat icon button', () => {
    const onStartDirectMessage = vi.fn();
    const user = { id: 42, username: 'supervisor' };

    render(
      <AttraccessUser user={user} description="Lab manager" onStartDirectMessage={onStartDirectMessage} />,
    );

    expect(screen.getByText('supervisor')).toBeInTheDocument();
    expect(screen.getByText('Lab manager')).toBeInTheDocument();

    // A single interactive trigger wrapping the user info — no separate standalone chat button
    expect(screen.getByRole('button', { name: /supervisor/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
