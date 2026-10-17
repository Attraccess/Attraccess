import { useReducer } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FirstTimeSetupPage } from './index';
const state = vi.hoisted(() => ({
  loading: false,
  refresh: () => undefined as void,
  status: undefined as
    | undefined
    | {
        available: boolean;
        stepsCompleted?: { app?: boolean; smtp?: boolean; admin?: boolean; adminEmailVerified?: boolean };
      },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useSettingsServiceGetFirstTimeSetupStatus: () => {
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    state.refresh = refresh;
    return { data: state.status, isLoading: state.loading };
  },
}));
vi.mock('../settings/forms/AppSettingsForm', () => ({
  AppSettingsForm: ({ onNext, endpoint }: { onNext: () => void; endpoint: string }) => (
    <button onClick={onNext}>Save URL {endpoint}</button>
  ),
}));
vi.mock('../settings/forms/SmtpSettingsForm', () => ({
  SmtpSettingsForm: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>Save SMTP</button>,
}));
vi.mock('./steps/LicenseStep', () => ({
  LicenseStep: ({ onSuccess }: { onSuccess: () => void }) => <button onClick={onSuccess}>Save license</button>,
}));
vi.mock('./steps/CreateAdminStep', () => ({
  CreateAdminStep: ({ onSuccess, isOverwrite }: { onSuccess: () => void; isOverwrite: boolean }) => (
    <button onClick={onSuccess}>{isOverwrite ? 'Replace admin' : 'Create admin'}</button>
  ),
}));
vi.mock('./steps/VerifyEmailStep', () => ({
  VerifyEmailStep: ({ onCorrectAdminDetails }: { onCorrectAdminDetails: () => void }) => (
    <button onClick={onCorrectAdminDetails}>Correct admin</button>
  ),
}));
function Fixture() {
  return (
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<FirstTimeSetupPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}
function show() {
  return render(<Fixture />);
}
beforeEach(() => {
  state.loading = false;
  state.status = { available: true };
});
afterEach(cleanup);
it('waits for setup status and redirects when setup is unavailable', () => {
  state.loading = true;
  const view = show();
  expect(screen.getByText('loading')).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.status = { available: false };
  show();
  expect(screen.getByText('Home')).toBeTruthy();
});
it('progresses through all five steps and allows correcting the administrator', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Save URL first-time-setup' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save SMTP' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save license' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create admin' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Correct admin' }));
  expect(await screen.findByRole('button', { name: 'Create admin' })).toBeTruthy();
});
it('resumes at the first unfinished step and exposes admin replacement until verification', async () => {
  state.status = { available: true, stepsCompleted: { app: true, smtp: true, admin: true, adminEmailVerified: false } };
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Correct admin' }));
  expect(await screen.findByRole('button', { name: 'Replace admin' })).toBeTruthy();
});
it('keeps verification visible when an in-progress setup completes on the server', async () => {
  state.status = { available: true, stepsCompleted: { app: true, smtp: true, admin: true, adminEmailVerified: true } };
  show();
  expect(await screen.findByRole('button', { name: 'Correct admin' })).toBeTruthy();
  state.status = { ...state.status, available: false };
  act(() => state.refresh());
  expect(screen.queryByText('Home')).toBeNull();
});
