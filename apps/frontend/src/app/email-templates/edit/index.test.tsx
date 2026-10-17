import { useReducer } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditEmailTemplatePage } from './index';
import { CONTENT_PLACEHOLDER, CHROME_CLASS } from './mjmlLayout';
const state = vi.hoisted(() => ({
  template: {
    subject: 'Welcome',
    body: '<mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section>',
    variables: ['username'],
  },
  layout: '',
  settled: true,
  update: vi.fn(),
  reset: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  editor: {} as { initialValue: string; onChange: (body: string) => void; headMjml?: string; lockClass?: string },
  liveContent: '',
  refresh: () => undefined as void,
}));
vi.mock('@attraccess/react-query-client', () => ({
  useEmailTemplatesServiceEmailTemplateControllerFindOne: () => {
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    state.refresh = refresh;
    return { data: state.template };
  },
  useEmailLayoutServiceEmailLayoutControllerFindGlobal: () => ({
    data: { body: state.layout },
    isSuccess: state.settled,
    isError: false,
  }),
  useEmailTemplatesServiceEmailTemplateControllerUpdate: () => ({ mutate: state.update }),
  useEmailTemplatesServiceEmailTemplateControllerResetToDefault: () => ({ mutate: state.reset }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, language: 'en' }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('./MjmlVisualEditor', () => ({
  MjmlVisualEditor: (props: typeof state.editor) => {
    state.editor = props;
    return (
      <textarea
        aria-label="Email body"
        defaultValue={props.initialValue}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));
vi.mock('./TranslationsSection', () => ({
  TranslationsSection: ({ liveContent }: { liveContent: string }) => {
    state.liveContent = liveContent;
    return <div>Translations editor</div>;
  },
}));
function Fixture() {
  return (
    <MemoryRouter initialEntries={['/settings/email/templates/welcome']}>
      <Routes>
        <Route path="/settings/email/templates/:type" element={<EditEmailTemplatePage />} />
        <Route path="/settings/email/templates" element={<div>Template list</div>} />
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.template = {
    subject: 'Welcome',
    body: '<mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section>',
    variables: ['username'],
  };
  state.layout = '';
  state.settled = true;
});
afterEach(cleanup);
it('waits for layout resolution and preserves unsaved canvas changes across background refetches', async () => {
  state.settled = false;
  render(<Fixture />);
  expect(screen.queryByRole('textbox')).toBeNull();
  act(() => {
    state.settled = true;
    state.refresh();
  });
  const editor = await screen.findByRole('textbox', { name: 'Email body' });
  fireEvent.change(editor, { target: { value: '<mj-section>Draft</mj-section>' } });
  state.template = { ...state.template, body: '<mj-section>Server update</mj-section>', subject: 'Server subject' };
  act(() => state.refresh());
  expect(editor).toHaveValue('<mj-section>Draft</mj-section>');
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.update).toHaveBeenCalledWith(
    { type: 'welcome', requestBody: { subject: 'Welcome', body: '<mj-section>Draft</mj-section>' } },
    expect.any(Object),
  );
  act(() => state.update.mock.calls[0][1].onSuccess());
  expect(state.success).toHaveBeenCalledWith({ title: 'toast.saveSuccess' });
});
it('wraps global chrome for display and strips it from saved template content', async () => {
  state.layout = `<mjml><mj-head><mj-title>Brand</mj-title></mj-head><mj-body><mj-section><mj-column><mj-text>Header</mj-text></mj-column></mj-section>${CONTENT_PLACEHOLDER}</mj-body></mjml>`;
  render(<Fixture />);
  await screen.findByRole('textbox');
  expect(state.editor.lockClass).toBe(CHROME_CLASS);
  expect(state.editor.headMjml).toContain('Brand');
  expect(state.editor.initialValue).toContain('Header');
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.update.mock.calls[0][0].requestBody.body).toBe(state.template.body);
  fireEvent.click(screen.getByRole('button', { name: 'actions.translations' }));
  expect(await screen.findByText('Translations editor')).toBeTruthy();
  expect(state.liveContent).toBe('Welcome\n' + state.template.body);
});
it('reports save errors and blocks malformed wrapped documents', async () => {
  state.layout = `<mjml><mj-body>${CONTENT_PLACEHOLDER}</mj-body></mjml>`;
  render(<Fixture />);
  const editor = await screen.findByRole('textbox');
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  act(() => state.update.mock.calls[0][1].onError({ body: { message: ['Invalid template', 'Second'] } }));
  expect(state.error).toHaveBeenCalledWith({ title: 'toast.saveError', description: 'Invalid template' });
  state.update.mockClear();
  fireEvent.change(editor, { target: { value: '<mjml><broken>' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.update).not.toHaveBeenCalled();
  expect(state.error).toHaveBeenLastCalledWith({ title: 'toast.saveError', description: 'toast.extractError' });
});
it('requires reset confirmation and reseeds the editor from the reset response', async () => {
  render(<Fixture />);
  await screen.findByRole('textbox');
  fireEvent.click(screen.getByRole('button', { name: 'actions.resetToDefault' }));
  fireEvent.click(await screen.findByRole('button', { name: 'resetConfirm.confirm' }));
  expect(state.reset).toHaveBeenCalledWith({ type: 'welcome' }, expect.any(Object));
  act(() => state.reset.mock.calls[0][1].onError());
  expect(state.error).toHaveBeenCalledWith({ title: 'toast.resetError' });
  act(() =>
    state.reset.mock.calls[0][1].onSuccess({
      subject: 'Default subject',
      body: '<mj-section>Default body</mj-section>',
    }),
  );
  expect(await screen.findByRole('textbox')).toHaveValue('<mj-section>Default body</mj-section>');
  expect(state.success).toHaveBeenCalledWith({ title: 'toast.resetSuccess' });
  fireEvent.click(screen.getByRole('button', { name: 'actions.back' }));
  expect(screen.getByText('Template list')).toBeTruthy();
});
