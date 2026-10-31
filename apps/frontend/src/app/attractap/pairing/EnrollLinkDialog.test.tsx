import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrollLinkDialog } from './EnrollLinkDialog';

const dialog = vi.hoisted(() => vi.fn());
vi.mock('./PairingDialog', () => ({
  PairingDialog: (props: { presetCode?: string }) => {
    dialog(props);
    return <p>dialog {props.presetCode}</p>;
  },
}));

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search}</output>;
}

const mount = (url: string, { signedIn = true, canEnroll = true } = {}) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <EnrollLinkDialog signedIn={signedIn} canEnroll={canEnroll} />
      <CurrentUrl />
    </MemoryRouter>,
  );

const currentUrl = () => screen.getByRole('status', { name: 'Current URL' });

describe('EnrollLinkDialog', () => {
  beforeEach(() => dialog.mockClear());

  it('opens the pairing dialog with the code of ?enroll', () => {
    mount('/resources?enroll=K7P3XQ');
    expect(screen.getByText('dialog K7P3XQ')).toBeInTheDocument();
  });

  it('does nothing without the link', () => {
    mount('/resources');
    expect(dialog).not.toHaveBeenCalled();
  });

  it('waits for sign-in and keeps the link for afterwards', () => {
    mount('/resources?enroll=K7P3XQ', { signedIn: false, canEnroll: false });
    expect(dialog).not.toHaveBeenCalled();
    expect(document.querySelector('[data-cy="attractap-enroll-link-no-permission"]')).toBeNull();
    expect(currentUrl()).toHaveTextContent('/resources?enroll=K7P3XQ');
  });

  it('tells a signed-in user without permission and removes the link when closed', async () => {
    mount('/resources?enroll=K7P3XQ', { canEnroll: false });
    expect(dialog).not.toHaveBeenCalled();
    expect(await screen.findByText(/does not have permission to approve readers/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close|schließen/i }));
    expect(currentUrl()).toHaveTextContent(/^\/resources$/);
  });
});
