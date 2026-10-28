import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MassIntroductionTargetType } from '@attraccess/react-query-client';
import { MassIntroductionRedeemModal, massIntroductionUrl } from './MassIntroductionRedeemModal';

const state = vi.hoisted(() => ({
  redeem: vi.fn(),
  isPending: false,
  results: [] as Array<{ data?: unknown; error?: unknown }>,
}));

type MutationOptions = { onSuccess: (data: unknown) => void; onError: (error: unknown) => void };

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useAccessControlServiceMassIntroductionRedeem: (options: MutationOptions) => ({
    isPending: state.isPending,
    mutate: (variables: unknown) => {
      state.redeem(variables);
      const next = state.results.shift() ?? {};
      if (next.error) options.onError(next.error);
      else options.onSuccess(next.data);
    },
  }),
}));

// Stand-in for the digit slots: one text field that reports its whole value.
vi.mock('../../components/OneTimeCodeInput', () => ({
  OneTimeCodeInput: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search}</output>;
}

function mount(url = '/resources/7?massIntroduction=pub-1&tab=people', canRedeem = true) {
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
const typeCode = (code: string) =>
  act(() => fireEvent.change(screen.getByLabelText('Code'), { target: { value: code } }));
const introduced = { data: { target: { type: 'resource', id: 7, name: 'Laser Cutter' }, alreadyIntroduced: false } };

beforeEach(() => {
  vi.clearAllMocks();
  state.isPending = false;
  state.results = [];
});
afterEach(cleanup);

describe('MassIntroductionRedeemModal', () => {
  it('puts only the session id in the QR code, pointing at the resource page or the overview', () => {
    const origin = window.location.origin;
    expect(
      massIntroductionUrl({ publicId: 'a', target: { type: MassIntroductionTargetType.RESOURCE, id: 7, name: '' } }),
    ).toBe(`${origin}/resources/7?massIntroduction=a`);
    expect(
      massIntroductionUrl({ publicId: 'b', target: { type: MassIntroductionTargetType.GROUP, id: 3, name: '' } }),
    ).toBe(`${origin}/resources?massIntroduction=b`);
  });

  it('asks for the shown code, joins once all digits are entered and cleans up the URL', async () => {
    state.results = [introduced];
    const { invalidate } = mount();

    expect(await screen.findByRole('alertdialog', { name: 'Join the mass introduction' })).toBeInTheDocument();
    expect(currentUrl()).toHaveTextContent('/resources/7?tab=people');
    expect(state.redeem).not.toHaveBeenCalled();

    typeCode('04291');
    expect(state.redeem).not.toHaveBeenCalled();
    typeCode('042917');

    expect(state.redeem).toHaveBeenCalledTimes(1);
    expect(state.redeem).toHaveBeenCalledWith({ requestBody: { publicId: 'pub-1', code: '042917' } });
    expect(await screen.findByRole('alertdialog', { name: 'Introduction complete' })).toBeInTheDocument();
    expect(screen.getByText("You've been introduced to Laser Cutter.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('waits for sign-in before asking for the code', async () => {
    const { signIn } = mount('/resources/7?massIntroduction=pub-1', false);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(currentUrl()).toHaveTextContent('/resources/7?massIntroduction=pub-1');

    signIn();

    expect(await screen.findByRole('alertdialog', { name: 'Join the mass introduction' })).toBeInTheDocument();
    expect(currentUrl()).toHaveTextContent(/^\/resources\/7$/);
  });

  it('lets the participant retry after a wrong or expired code', async () => {
    state.results = [
      { error: { status: 400, message: 'Bad Request', body: { message: 'Wrong or expired code' } } },
      introduced,
    ];
    mount();
    await screen.findByRole('alertdialog', { name: 'Join the mass introduction' });

    typeCode('111111');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Wrong or expired code/);
    expect(screen.getByLabelText('Code')).toHaveValue('');

    typeCode('042917');
    expect(await screen.findByRole('alertdialog', { name: 'Introduction complete' })).toBeInTheDocument();
    expect(state.redeem).toHaveBeenCalledTimes(2);
  });

  it('tells the participant to wait after too many wrong codes', async () => {
    state.results = [{ error: { status: 429, message: 'Too Many Requests', body: {} } }];
    mount();
    await screen.findByRole('alertdialog', { name: 'Join the mass introduction' });

    typeCode('111111');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Wait a minute/);
  });

  it('explains when the mass introduction has ended', async () => {
    state.results = [{ error: { status: 404, message: 'Not Found', body: {} } }];
    mount();
    await screen.findByRole('alertdialog', { name: 'Join the mass introduction' });

    typeCode('042917');

    expect(await screen.findByRole('alertdialog', { name: 'Introduction failed' })).toBeInTheDocument();
    expect(screen.getByText(/has ended/)).toBeInTheDocument();
  });

  it('tells participants who were already introduced', async () => {
    state.results = [{ data: { target: { type: 'group', id: 3, name: 'Wood shop' }, alreadyIntroduced: true } }];
    mount('/resources?massIntroduction=pub-2');
    await screen.findByRole('alertdialog', { name: 'Join the mass introduction' });

    typeCode('042917');

    expect(await screen.findByText('You already had an introduction to Wood shop.')).toBeInTheDocument();
  });

  it('renders nothing without a session in the URL', () => {
    mount('/resources/7');

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
