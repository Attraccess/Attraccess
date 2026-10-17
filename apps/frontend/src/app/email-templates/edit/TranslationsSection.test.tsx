import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailTemplateType } from '@attraccess/react-query-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TranslationsSection } from './TranslationsSection';
const state = vi.hoisted(() => ({
  data: { translations: { en: { greeting: 'Hello', unused: 'Preserve' }, de: { greeting: 'Hallo' } } } as {
    translations: Record<string, Record<string, string>>;
  },
  loading: false,
  error: false,
  save: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('./useTemplateTranslations', () => ({
  useTemplateTranslations: () => ({
    query: { data: state.data, isLoading: state.loading, isError: state.error, refetch: state.refetch },
    saveMutation: { mutateAsync: state.save },
    deleteMutation: { mutateAsync: state.remove },
  }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.toastError }),
}));
const type = Object.values(EmailTemplateType)[0];
const content = '{{t "greeting" "Hello"}} {{t "bye" "Goodbye"}}';
const originalAnimations = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations');
beforeEach(() => {
  vi.clearAllMocks();
  state.data = { translations: { en: { greeting: 'Hello', unused: 'Preserve' }, de: { greeting: 'Hallo' } } };
  state.loading = false;
  state.error = false;
  state.save.mockResolvedValue({});
  state.remove.mockResolvedValue({});
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(() => {
  cleanup();
  if (originalAnimations) Object.defineProperty(Element.prototype, 'getAnimations', originalAnimations);
  else Reflect.deleteProperty(Element.prototype, 'getAnimations');
});
function mount() {
  return render(<TranslationsSection templateType={type} liveContent={content} />);
}
it('keeps per-language drafts and saves only nonblank values while preserving other keys', async () => {
  mount();
  fireEvent.click(screen.getByRole('tab', { name: /English/ }));
  const fields = screen.getAllByRole('textbox');
  fireEvent.change(fields[0], { target: { value: 'Welcome' } });
  fireEvent.change(fields[1], { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('tab', { name: /German/ }));
  expect(screen.getAllByRole('textbox')[0]).toHaveValue('Hallo');
  fireEvent.click(screen.getByRole('tab', { name: /English/ }));
  expect(screen.getAllByRole('textbox')[0]).toHaveValue('Welcome');
  fireEvent.click(screen.getByRole('button', { name: 'Save translations' }));
  await waitFor(() =>
    expect(state.save).toHaveBeenCalledWith({
      type,
      requestBody: { locale: 'en', translations: { greeting: 'Welcome', unused: 'Preserve' } },
    }),
  );
  expect(state.success).toHaveBeenCalledWith({ title: 'Translations saved' });
  state.save.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Save translations' }));
  await waitFor(() => expect(state.toastError).toHaveBeenCalledWith({ title: 'Failed to save translations' }));
});
it('validates custom locales and can remove an unsaved locale without a server deletion', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole('button', { name: 'Add language' }));
  await user.click(screen.getByRole('menuitem', { name: 'Other language…' }));
  const input = screen.getByPlaceholderText('de-CH');
  await user.type(input, 'EN-us');
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  await user.clear(input);
  await user.type(input, 'sw');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByRole('tab', { name: /Swahili/ })).toHaveAttribute('aria-selected', 'true');
  await user.click(screen.getByRole('button', { name: 'Remove Swahili' }));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(screen.queryByRole('tab', { name: /Swahili/ })).toBeNull());
  expect(state.remove).not.toHaveBeenCalled();
});
it('adds a common locale and deletes an existing language only after confirmation', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole('button', { name: 'Add language' }));
  await user.click(screen.getByRole('menuitem', { name: 'French fr' }));
  expect(screen.getByRole('tab', { name: /French/ })).toHaveAttribute('aria-selected', 'true');
  await user.click(screen.getByRole('tab', { name: /German/ }));
  await user.click(screen.getByRole('button', { name: 'Remove German' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Remove German' }));
  state.remove.mockRejectedValueOnce(new Error('Offline'));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(state.toastError).toHaveBeenCalledWith({ title: 'Failed to delete translations' }));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  expect(state.remove).toHaveBeenCalledWith({ type, locale: 'de' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it.each(['empty', 'loading', 'error', 'no-keys'])('renders the %s state safely', (kind) => {
  if (kind === 'empty') state.data = { translations: {} };
  state.loading = kind === 'loading';
  state.error = kind === 'error';
  render(<TranslationsSection templateType={type} liveContent={kind === 'no-keys' ? '<p>Plain</p>' : content} />);
  expect(screen.queryByRole('textbox')).toBeNull();
  if (kind === 'error') {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  }
  if (kind === 'empty') expect(screen.getByText('No languages added yet')).toBeInTheDocument();
});
