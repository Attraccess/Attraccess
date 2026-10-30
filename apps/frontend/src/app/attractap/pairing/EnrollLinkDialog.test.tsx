import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrollLinkDialog } from './EnrollLinkDialog';

const dialog = vi.hoisted(() => vi.fn());
vi.mock('./PairingDialog', () => ({
  PairingDialog: (props: { presetCode?: string }) => {
    dialog(props);
    return <p>dialog {props.presetCode}</p>;
  },
}));

const mount = (url: string, canEnroll = true) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <EnrollLinkDialog canEnroll={canEnroll} />
    </MemoryRouter>,
  );

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

  it('does nothing when the user may not enroll readers or is not signed in', () => {
    mount('/resources?enroll=K7P3XQ', false);
    expect(dialog).not.toHaveBeenCalled();
  });
});
