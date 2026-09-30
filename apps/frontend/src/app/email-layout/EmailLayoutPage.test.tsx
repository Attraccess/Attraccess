import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EmailLayoutPage } from './EmailLayoutPage';
const state = vi.hoisted(() => ({
  body: '<mjml><mj-head><mj-title>Brand</mj-title></mj-head><mj-body>{{content}}</mj-body></mjml>' as
    string | undefined,
  error: false,
  refetch: vi.fn(),
  update: vi.fn(),
  reset: vi.fn(),
  success: vi.fn(),
  toastError: vi.fn(),
  register: vi.fn(),
  setLanguage: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useEmailLayoutServiceEmailLayoutControllerFindGlobal: () => ({
    data: state.body ? { body: state.body } : undefined,
    isError: state.error,
    refetch: state.refetch,
  }),
  useEmailLayoutServiceEmailLayoutControllerUpdate: () => ({ mutate: state.update }),
  useEmailLayoutServiceEmailLayoutControllerResetToDefault: () => ({ mutate: state.reset }),
}));
vi.mock('@attraccess/ui', () => ({ useAppTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.toastError }),
}));
vi.mock('../email-templates/edit/MjmlVisualEditor', () => ({
  MjmlVisualEditor: ({
    initialValue,
    onChange,
    headMjml,
  }: {
    initialValue: string;
    onChange: (value: string) => void;
    headMjml: string;
  }) => (
    <>
      <textarea
        aria-label="Layout body"
        defaultValue={initialValue}
        onChange={(event) => onChange(event.target.value)}
      />
      <output>{headMjml}</output>
    </>
  ),
}));
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
    onMount,
  }: {
    value: string;
    onChange: (value: string) => void;
    onMount: (...args: unknown[]) => void;
  }) => (
    <textarea
      aria-label="Styles code"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      ref={(node) => {
        if (node)
          onMount(
            { getModel: () => ({ getLanguageId: () => 'plaintext' }) },
            {
              languages: { getLanguages: () => [], register: state.register },
              editor: { setModelLanguage: state.setLanguage },
            },
          );
      }}
    />
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.body = '<mjml><mj-head><mj-title>Brand</mj-title></mj-head><mj-body>{{content}}</mj-body></mjml>';
  state.error = false;
});
afterEach(cleanup);
function mount() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<EmailLayoutPage />} />
        <Route path="/settings/email" element={<p>Email settings</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('preserves the placeholder and applies styles to the saved full document', async () => {
  mount();
  const body = await screen.findByRole('textbox', { name: 'Layout body' });
  expect((body as HTMLTextAreaElement).value).toContain('layout-content-placeholder');
  fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
  const code = screen.getByRole('textbox', { name: 'Styles code' });
  expect(code).toHaveValue('<mj-head><mj-title>Brand</mj-title></mj-head>');
  fireEvent.change(code, { target: { value: '<mj-head><mj-title>New brand</mj-title></mj-head>' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(state.register).toHaveBeenCalledWith({ id: 'mjml', extensions: ['.mjml'], aliases: ['MJML', 'mjml'] });
  expect(state.setLanguage).toHaveBeenCalledWith(expect.anything(), 'mjml');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(state.update).toHaveBeenCalledWith(
    {
      requestBody: {
        body: '<mjml><mj-head><mj-title>New brand</mj-title></mj-head><mj-body>{{content}}</mj-body></mjml>',
      },
    },
    expect.anything(),
  );
  act(() => state.update.mock.calls[0][1].onSuccess());
  expect(state.success).toHaveBeenCalledWith({ title: 'Global email layout saved successfully.' });
  act(() => state.update.mock.calls[0][1].onError({ body: { message: ['Invalid layout'] } }));
  expect(state.toastError).toHaveBeenCalledWith({ title: 'Failed to save layout.', description: 'Invalid layout' });
  fireEvent.click(screen.getByRole('button', { name: 'Back to emails' }));
  expect(await screen.findByText('Email settings')).toBeInTheDocument();
});
it('rejects missing content placeholders and cancels unapplied style edits', async () => {
  mount();
  await screen.findByRole('textbox', { name: 'Layout body' });
  fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Styles code' }), { target: { value: 'discard' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
  expect(screen.getByRole('textbox', { name: 'Styles code' })).toHaveValue(
    '<mj-head><mj-title>Brand</mj-title></mj-head>',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Layout body' }), {
    target: { value: '<mjml><mj-body /></mjml>' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(state.update).not.toHaveBeenCalled();
  expect(state.toastError).toHaveBeenCalledWith({ title: 'The layout is missing the content placeholder.' });
});
it('requires reset confirmation and reseeds from the returned default', async () => {
  mount();
  await screen.findByRole('textbox');
  fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.reset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  act(() => state.reset.mock.calls[0][1].onError());
  expect(state.toastError).toHaveBeenCalledWith({ title: 'Layout could not be reset.' });
  act(() =>
    state.reset.mock.calls[0][1].onSuccess({
      body: '<mjml><mj-body><mj-section>Default header</mj-section>{{content}}</mj-body></mjml>',
    }),
  );
  await waitFor(() =>
    expect((screen.getByRole('textbox', { name: 'Layout body' }) as HTMLTextAreaElement).value).toContain(
      'Default header',
    ),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('offers retry after a failed initial load', () => {
  state.body = undefined;
  state.error = true;
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(screen.queryByRole('textbox')).toBeNull();
});
