import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttraccessUser } from './AttraccessUser';

describe('AttraccessUser', () => {
  it('renders a mini avatar without the username text', () => {
    render(<AttraccessUser user={{ id: 42, username: 'supervisor' }} variant="mini" />);

    expect(screen.getByText('SU')).toBeInTheDocument();
    expect(screen.queryByText('supervisor')).not.toBeInTheDocument();
  });

  it('starts a direct message from the inline action', async () => {
    const onStartDirectMessage = vi.fn();
    const user = { id: 42, username: 'supervisor' };

    const { container } = render(
      <AttraccessUser user={user} description="Lab manager" onStartDirectMessage={onStartDirectMessage} />,
    );

    expect(screen.getByText('supervisor')).toBeInTheDocument();
    expect(screen.getByText('Lab manager')).toBeInTheDocument();

    const inlineAction = container.querySelector('button');
    expect(inlineAction).toBeInTheDocument();

    await userEvent.click(inlineAction!);

    expect(onStartDirectMessage).toHaveBeenCalledWith(user);
  });
});
