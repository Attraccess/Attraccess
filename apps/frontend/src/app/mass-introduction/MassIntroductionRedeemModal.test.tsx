import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MassIntroductionTargetType } from '@attraccess/react-query-client';
import { MassIntroductionRedeemModal, massIntroductionUrl } from './MassIntroductionRedeemModal';

const state = vi.hoisted(() => ({
  claim: vi.fn(),
  claimError: null as unknown,
  redeem: vi.fn(),
  result: null as unknown,
  error: null as unknown,
}));

type MutationOptions = { onSuccess: (data: unknown) => void; onError: (error: unknown) => void };

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useAccessControlServiceMassIntroductionClaim: (options: MutationOptions) => ({
    mutate: (variables: unknown) => {
      state.claim(variables);
      if (state.claimError) options.onError(state.claimError);
      else options.onSuccess({ ticket: 'ticket-1', expiresAt: new Date().toISOString() });
    },
  }),
  useAccessControlServiceMassIntroductionRedeem: (options: MutationOptions) => ({
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

function mount(url = '/resources/7?massIntroduction=pub.12345678&tab=people', canRedeem = true) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const tree = (redeemable: boolean) => (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <MassIntroductionRedeemModal canRedeem={redeemable} />
          <CurrentUrl />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
  const view = render(tree(canRedeem));
  return { invalidate, signIn: () => view.rerender(tree(true)) };
}

const currentUrl = () => screen.getByRole('status', { name: 'Current URL' });

beforeEach(() => {
  vi.clearAllMocks();
  state.result = { target: { type: 'resource', id: 7, name: 'Laser Cutter' }, alreadyIntroduced: false };
  state.error = null;
  state.claimError = null;
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

  it('claims the scanned code, redeems the ticket once and cleans up the URL', async () => {
    const { invalidate } = mount();

    expect(state.claim).toHaveBeenCalledTimes(1);
    expect(state.claim).toHaveBeenCalledWith({ requestBody: { token: 'pub.12345678' } });
    expect(state.redeem).toHaveBeenCalledTimes(1);
    expect(state.redeem).toHaveBeenCalledWith({ requestBody: { ticket: 'ticket-1' } });
    expect(await screen.findByRole('alertdialog', { name: 'Introduction complete' })).toBeInTheDocument();
    expect(screen.getByText("You've been introduced to Laser Cutter.")).toBeInTheDocument();
    expect(currentUrl()).toHaveTextContent('/resources/7?tab=people');
    expect(invalidate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('claims before sign-in and keeps the ticket in the URL until the participant can redeem it', async () => {
    const { signIn } = mount('/resources/7?massIntroduction=pub.12345678', false);

    expect(state.claim).toHaveBeenCalledTimes(1);
    expect(state.redeem).not.toHaveBeenCalled();
    expect(currentUrl()).toHaveTextContent('/resources/7?massIntroductionTicket=ticket-1');

    signIn();

    expect(state.redeem).toHaveBeenCalledTimes(1);
    expect(state.redeem).toHaveBeenCalledWith({ requestBody: { ticket: 'ticket-1' } });
    expect(await screen.findByRole('alertdialog', { name: 'Introduction complete' })).toBeInTheDocument();
    expect(currentUrl()).toHaveTextContent(/^\/resources\/7$/);
  });

  it('tells participants who were already introduced', async () => {
    state.result = { target: { type: 'group', id: 3, name: 'Wood shop' }, alreadyIntroduced: true };
    mount('/resources?massIntroduction=pub.12345678');

    expect(await screen.findByText('You already had an introduction to Wood shop.')).toBeInTheDocument();
  });

  it('explains expired codes right away, even before sign-in', async () => {
    state.claimError = { status: 404, message: 'Not Found', body: { message: 'expired' } };
    mount('/resources/7?massIntroduction=pub.00000000', false);

    expect(await screen.findByRole('alertdialog', { name: 'Introduction failed' })).toBeInTheDocument();
    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
    expect(state.redeem).not.toHaveBeenCalled();
    expect(currentUrl()).toHaveTextContent(/^\/resources\/7$/);
  });

  it('explains tickets that expired while signing in', async () => {
    state.error = { status: 404, message: 'Not Found', body: { message: 'expired' } };
    mount('/resources/7?massIntroductionTicket=old-ticket');

    expect(state.claim).not.toHaveBeenCalled();
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });

  it('shows other errors with the API message', async () => {
    state.error = { status: 403, message: 'Forbidden', body: { message: 'The introducer can no longer introduce' } };
    mount();

    expect(await screen.findByText('Something went wrong: The introducer can no longer introduce')).toBeInTheDocument();
  });

  it('renders nothing without a code in the URL', () => {
    mount('/resources/7');

    expect(state.claim).not.toHaveBeenCalled();
    expect(state.redeem).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
