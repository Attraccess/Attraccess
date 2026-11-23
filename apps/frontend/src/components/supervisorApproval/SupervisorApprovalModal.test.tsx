import '@testing-library/jest-dom/vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupervisorApprovalModal } from './SupervisorApprovalModal';

const network = vi.hoisted(() => ({ restricted: new Set<string>() }));
vi.mock('../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => network.restricted.has(action) }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
    AttraccessUser: ({ user }: { user: { username: string } }) => <div>requester:{user.username}</div>,
  }))()),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useGetOneResourceById: () => ({ data: { id: 7, name: 'Laser Cutter' } }),
}));

const baseRequest = {
  id: 'req-1',
  resourceId: 7,
  requesterUserId: 5,
  requesterUsername: 'bob',
  requesterDisplayName: 'Bob Builder',
  supervisorUserId: 1,
  notes: 'please',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
};

function renderModal(overrides = {}) {
  const props = {
    request: baseRequest,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onIgnore: vi.fn(),
    onExpire: vi.fn(),
    isApproving: false,
    isRejecting: false,
    ...overrides,
  };
  render(<SupervisorApprovalModal {...props} />);
  return props;
}

describe('SupervisorApprovalModal', () => {
  afterEach(() => {
    vi.useRealTimers();
    network.restricted = new Set();
  });

  it('disables approve outside the allowed network but keeps reject, and says why', () => {
    network.restricted = new Set(['supervision.approve']);
    renderModal();
    expect(screen.getByRole('button', { name: 'approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'reject' })).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent('onlyLocal');
  });

  it('shows the requester and resource', () => {
    renderModal();
    expect(screen.getByText('requester:bob')).toBeInTheDocument();
    expect(screen.getByText('please')).toBeInTheDocument();
  });

  it('calls onApprove and onReject', async () => {
    const props = renderModal();
    await userEvent.click(screen.getByText('approve'));
    expect(props.onApprove).toHaveBeenCalled();
    await userEvent.click(screen.getByText('reject'));
    expect(props.onReject).toHaveBeenCalled();
  });

  it('allows a supervisor to ignore the request without approving or rejecting it', async () => {
    const props = renderModal();

    await userEvent.click(screen.getByText('ignore'));

    expect(props.onIgnore).toHaveBeenCalled();
    expect(props.onApprove).not.toHaveBeenCalled();
    expect(props.onReject).not.toHaveBeenCalled();
  });

  it('calls onExpire once the deadline passes', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    renderModal({ request: { ...baseRequest, expiresAt: new Date(Date.now() + 1000).toISOString() }, onExpire });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(onExpire).toHaveBeenCalled();
  });
});
