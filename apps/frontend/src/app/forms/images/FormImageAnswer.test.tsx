import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormImageAnswer } from './FormImageAnswer';

const urlHook = vi.hoisted(() => vi.fn());
vi.mock('./useAuthenticatedImageUrl', () => ({ useAuthenticatedImageUrl: urlHook }));

afterEach(cleanup);
const A = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
const B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

it('shows one thumbnail per stored image id, named after the field, and never the raw JSON', () => {
  urlHook.mockReturnValue({ src: 'blob:x', isLoading: false, isError: false });
  const { container } = render(<FormImageAnswer value={JSON.stringify([A, B])} fieldName="Damage" />);
  expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual([
    'Damage: photo 1 of 2',
    'Damage: photo 2 of 2',
  ]);
  expect(container.textContent).not.toContain(A);
  expect(container.textContent).not.toContain('[');
  expect(urlHook).toHaveBeenCalledWith(expect.stringContaining(`/forms/images/${A}`));
});

it('opens the full image in a dialog when a thumbnail is pressed', () => {
  urlHook.mockImplementation((url: string | null) => ({
    src: url ? 'blob:x' : null,
    isLoading: false,
    isError: false,
  }));
  render(<FormImageAnswer value={JSON.stringify([A])} fieldName="Damage" />);
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Show full size: Damage: photo 1 of 1' }));

  const dialog = screen.getByRole('dialog', { name: 'Damage: photo 1 of 1' });
  expect(dialog.querySelector('img[alt="Damage: photo 1 of 1"]')).toBeTruthy();
});

it('shows a plain tile with an icon, not a button, when the photo cannot be loaded', () => {
  urlHook.mockReturnValue({ src: null, isLoading: false, isError: true });
  const { container } = render(<FormImageAnswer value={JSON.stringify([A])} fieldName="Damage" />);
  expect(screen.getByRole('img', { name: 'Photo not available' })).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(container.textContent).toBe('');
});

it('shows a dash for an empty or broken answer instead of the stored text', () => {
  for (const value of ['[]', 'not json', null, undefined]) {
    const { container, unmount } = render(<FormImageAnswer value={value} />);
    expect(container.textContent).toBe('–');
    unmount();
  }
});
