import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormImageAnswer } from './FormImageAnswer';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({
    t: (key: string, vars?: Record<string, unknown>) => `${key}${vars?.count ?? vars?.number ?? ''}`,
  }),
}));
const urlHook = vi.hoisted(() => vi.fn());
vi.mock('./useAuthenticatedImageUrl', () => ({ useAuthenticatedImageUrl: urlHook }));

afterEach(cleanup);
const A = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
const B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

it('shows one thumbnail per stored image id and never the raw JSON', () => {
  urlHook.mockReturnValue({ src: 'blob:x', isLoading: false, isError: false });
  const { container } = render(<FormImageAnswer value={JSON.stringify([A, B])} />);
  expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(container.textContent).not.toContain(A);
  expect(container.textContent).not.toContain('[');
  expect(urlHook).toHaveBeenCalledWith(expect.stringContaining(`/forms/images/${A}`));
});

it('opens the full image when a thumbnail is pressed', () => {
  urlHook.mockImplementation((url: string | null) => ({
    src: url ? 'blob:x' : null,
    isLoading: false,
    isError: false,
  }));
  render(<FormImageAnswer value={JSON.stringify([A])} />);
  fireEvent.click(screen.getByRole('button', { name: 'open1' }));
  expect(screen.getAllByRole('img').length).toBeGreaterThan(1);
});

it('counts the photos where space is tight', () => {
  const { container } = render(<FormImageAnswer value={JSON.stringify([A, B])} compact />);
  expect(container.textContent).toBe('photos2');
  expect(screen.queryByRole('img')).toBeNull();
  cleanup();
  expect(render(<FormImageAnswer value={JSON.stringify([A])} compact />).container.textContent).toBe('photo');
});

it('shows a dash for an empty or broken answer instead of the stored text', () => {
  for (const value of ['[]', 'not json', null, undefined]) {
    const { container, unmount } = render(<FormImageAnswer value={value} />);
    expect(container.textContent).toBe('–');
    unmount();
  }
});
