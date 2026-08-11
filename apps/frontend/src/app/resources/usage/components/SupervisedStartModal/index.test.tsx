import '@testing-library/jest-dom/vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupervisedStartModal } from './index';

const { requestMutate, ApiErrorMock } = vi.hoisted(() => {
  class ApiErrorMock extends Error {
    status: number;
    constructor(status: number) {
      super('api error');
      this.status = status;
    }
  }
  return { requestMutate: vi.fn(), ApiErrorMock };
});

vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, username: 'me' } }),
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
  AttraccessUser: ({ user }: { user: { username: string } }) => <div>{user.username}</div>,
}));

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: ApiErrorMock,
  ResourceIntroducerType: { INTRODUCER: 'introducer', MAINTAINER: 'maintainer' },
  useAccessControlServiceResourceIntroducersGetMany: () => ({
    isLoading: false,
    data: [
      { id: 10, userId: 2, type: 'introducer', user: { id: 2, username: 'alice' } },
      { id: 11, userId: 1, type: 'introducer', user: { id: 1, username: 'me' } },
    ],
  }),
  useResourcesServiceResourceUsageRequestSupervisedSession: () => ({ mutate: requestMutate }),
  useAttractapServiceGetReaders: () => ({
    data: [
      // Attached to this resource.
      {
        id: 5,
        name: 'Workshop reader',
        resources: [{ id: 42 }],
        firmware: { capabilities: { cardEnrollment: true } },
      },
      // Elsewhere in the building — offered behind the disclosure.
      { id: 6, name: 'Lobby reader', resources: [{ id: 7 }], firmware: { capabilities: { cardEnrollment: true } } },
      // No display, so it cannot run the supervision screen at all.
      {
        id: 7,
        name: 'Lite reader',
        resources: [{ id: 42 }],
        firmware: { capabilities: { cardEnrollment: false } },
      },
    ],
  }),
}));

const getLastCallbacks = () => requestMutate.mock.calls[requestMutate.mock.calls.length - 1][1];

describe('SupervisedStartModal', () => {
  beforeEach(() => {
    requestMutate.mockClear();
  });

  function renderModal(onApproved = vi.fn()) {
    return render(
      <SupervisedStartModal
        isOpen={true}
        onClose={vi.fn()}
        resourceId={42}
        requestBody={{ notes: 'hi' }}
        onApproved={onApproved}
      />,
    );
  }

  it('lists authorized supervisors and excludes the requester', () => {
    renderModal();
    expect(screen.getByText('alice')).toBeInTheDocument();
    // The requester (id 1) must not be offered as a supervisor.
    expect(screen.queryByText('me')).not.toBeInTheDocument();
  });

  it('requests supervision for the selected supervisor and waits', async () => {
    renderModal();
    await userEvent.click(screen.getByText('alice'));

    expect(requestMutate).toHaveBeenCalledWith(
      { resourceId: 42, requestBody: { notes: 'hi', supervisorUserId: 2 } },
      expect.any(Object),
    );
    expect(screen.getByText('waiting.description')).toBeInTheDocument();
  });

  it('shows the timeout state on a 408 and allows retry', async () => {
    renderModal();
    await userEvent.click(screen.getByText('alice'));

    act(() => getLastCallbacks().onError(new ApiErrorMock(408)));
    expect(screen.getByText('timeout.description')).toBeInTheDocument();

    await userEvent.click(screen.getByText('retry'));
    expect(screen.getByText('select.description')).toBeInTheDocument();
  });

  it('shows the rejected state on a 403', async () => {
    renderModal();
    await userEvent.click(screen.getByText('alice'));

    act(() => getLastCallbacks().onError(new ApiErrorMock(403)));
    expect(screen.getByText('rejected.description')).toBeInTheDocument();
  });

  it('calls onApproved when the supervisor approves', async () => {
    const onApproved = vi.fn();
    renderModal(onApproved);
    await userEvent.click(screen.getByText('alice'));

    const session = { id: 99 };
    act(() => getLastCallbacks().onSuccess(session));
    expect(onApproved).toHaveBeenCalledWith(session);
  });

  describe('reader authentication (ATT-816)', () => {
    it("offers the resource's own readers and hides display-less ones", () => {
      renderModal();

      expect(screen.getByText('Workshop reader')).toBeInTheDocument();
      // Attached to this resource, but has no screen to run the supervision flow on.
      expect(screen.queryByText('Lite reader')).not.toBeInTheDocument();
    });

    it('puts readers belonging to other resources behind a disclosure', async () => {
      renderModal();

      // The accordion keeps its panel mounted, so assert on visibility rather than presence.
      expect(screen.getByText('Lobby reader')).not.toBeVisible();

      await userEvent.click(screen.getByText('select.otherReaders'));
      expect(screen.getByText('Lobby reader')).toBeVisible();
    });

    it('requests supervision at the selected reader and names it while waiting', async () => {
      renderModal();
      await userEvent.click(screen.getByText('Workshop reader'));

      expect(requestMutate).toHaveBeenCalledWith(
        { resourceId: 42, requestBody: { notes: 'hi', readerId: 5 } },
        expect.any(Object),
      );
      expect(screen.getByText('waiting.atReader')).toBeInTheDocument();
    });

    it('distinguishes an unusable reader from a supervisor declining', async () => {
      renderModal();
      await userEvent.click(screen.getByText('Workshop reader'));

      // 409: the reader is busy with another flow — not a rejection.
      act(() => getLastCallbacks().onError(new ApiErrorMock(409)));
      expect(screen.getByText('error.description')).toBeInTheDocument();
      expect(screen.queryByText('rejected.description')).not.toBeInTheDocument();
    });
  });
});
