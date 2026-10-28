import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MassIntroductionLandingPage } from './index';

const state = vi.hoisted(() => ({
  redeem: vi.fn(),
  result: null as unknown,
  error: null as unknown,
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useAccessControlServiceMassIntroductionRedeem: (options: {
    onSuccess: (data: unknown) => void;
    onError: (error: unknown) => void;
  }) => ({
    mutate: (variables: unknown) => {
      state.redeem(variables);
      if (state.error) options.onError(state.error);
      else options.onSuccess(state.result);
    },
  }),
}));

function mount(url = '/mass-introduction?token=tok-1') {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/mass-introduction" element={<MassIntroductionLandingPage />} />
          <Route path="/resources" element={<p>Resource overview</p>} />
          <Route path="/resources/:id" element={<p>Resource page</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.result = { target: { type: 'resource', id: 7, name: 'Laser Cutter' }, alreadyIntroduced: false };
  state.error = null;
});
afterEach(cleanup);

describe('MassIntroductionLandingPage', () => {
  it('redeems the token exactly once and links to the resource', () => {
    mount();

    expect(state.redeem).toHaveBeenCalledTimes(1);
    expect(state.redeem).toHaveBeenCalledWith({ requestBody: { token: 'tok-1' } });
    expect(screen.getByText("You've been introduced to Laser Cutter.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open resource' }));
    expect(screen.getByText('Resource page')).toBeInTheDocument();
  });

  it('tells users who were already introduced and sends group participants to the overview', () => {
    state.result = { target: { type: 'group', id: 3, name: 'Wood shop' }, alreadyIntroduced: true };
    mount();

    expect(screen.getByText('You already had an introduction to Wood shop.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show resources' }));
    expect(screen.getByText('Resource overview')).toBeInTheDocument();
  });

  it('explains invalid or expired codes', () => {
    state.error = { status: 404, message: 'Not Found', body: { message: 'invalid or expired' } };
    mount();

    expect(screen.getByText(/This QR code is invalid or has expired/)).toBeInTheDocument();
  });

  it('shows the API message for other failures', () => {
    state.error = {
      status: 403,
      message: 'Forbidden',
      body: { message: 'The introducer can no longer introduce to this target' },
    };
    mount();

    expect(
      screen.getByText('Something went wrong: The introducer can no longer introduce to this target'),
    ).toBeInTheDocument();
  });

  it('does not call the API without a token', () => {
    mount('/mass-introduction');

    expect(state.redeem).not.toHaveBeenCalled();
    expect(screen.getByText('This link does not contain a mass-introduction code.')).toBeInTheDocument();
  });
});
