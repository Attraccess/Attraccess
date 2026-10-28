import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MassIntroductionTargetType } from '@attraccess/react-query-client';
import { MassIntroductionRedeemModal, massIntroductionUrl } from './MassIntroductionRedeemModal';

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

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search}</output>;
}

function mount(url = '/resources/7?massIntroduction=tok-1&tab=people') {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <MassIntroductionRedeemModal />
          <CurrentUrl />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  return { invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.result = { target: { type: 'resource', id: 7, name: 'Laser Cutter' }, alreadyIntroduced: false };
  state.error = null;
});
afterEach(cleanup);

describe('MassIntroductionRedeemModal', () => {
  it('points resource QR codes at the resource page and group QR codes at the overview', () => {
    const origin = window.location.origin;
    expect(
      massIntroductionUrl({ token: 'a', target: { type: MassIntroductionTargetType.RESOURCE, id: 7, name: '' } }),
    ).toBe(`${origin}/resources/7?massIntroduction=a`);
    expect(
      massIntroductionUrl({ token: 'b', target: { type: MassIntroductionTargetType.GROUP, id: 3, name: '' } }),
    ).toBe(`${origin}/resources?massIntroduction=b`);
  });

  it('redeems the token once, removes it from the URL and refreshes the page behind the modal', async () => {
    const { invalidate } = mount();

    expect(state.redeem).toHaveBeenCalledTimes(1);
    expect(state.redeem).toHaveBeenCalledWith({ requestBody: { token: 'tok-1' } });
    expect(await screen.findByRole('alertdialog', { name: 'Introduction complete' })).toBeInTheDocument();
    expect(screen.getByText("You've been introduced to Laser Cutter.")).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Current URL' })).toHaveTextContent('/resources/7?tab=people');
    expect(invalidate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(state.redeem).toHaveBeenCalledTimes(1);
  });

  it('tells participants who were already introduced', async () => {
    state.result = { target: { type: 'group', id: 3, name: 'Wood shop' }, alreadyIntroduced: true };
    mount('/resources?massIntroduction=tok-2');

    expect(await screen.findByText('You already had an introduction to Wood shop.')).toBeInTheDocument();
  });

  it('explains invalid or expired codes', async () => {
    state.error = { status: 404, message: 'Not Found', body: { message: 'expired' } };
    mount();

    expect(await screen.findByRole('alertdialog', { name: 'Introduction failed' })).toBeInTheDocument();
    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
  });

  it('shows other errors with the API message', async () => {
    state.error = { status: 403, message: 'Forbidden', body: { message: 'The introducer can no longer introduce' } };
    mount();

    expect(await screen.findByText('Something went wrong: The introducer can no longer introduce')).toBeInTheDocument();
  });

  it('renders nothing without a code in the URL', () => {
    mount('/resources/7');

    expect(state.redeem).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
