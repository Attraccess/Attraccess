import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attractap } from '@attraccess/react-query-client';
import { SecureThisReader } from './SecureThisReader';

const mocks = vi.hoisted(() => ({
  canManage: true,
  eligibility: { hidden: false, blockers: [] as string[] },
  status: {
    conversion: null as unknown,
    online: true,
    canCancel: false,
    canRetry: false,
    signingKeyAvailable: null as boolean | null,
  },
  preflight: vi.fn(),
  preflightData: undefined as unknown,
  start: vi.fn(),
  retry: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => mocks.canManage }) }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGetSecureConversionEligibility: () => ({ data: mocks.eligibility, isLoading: false, refetch: vi.fn() }),
  useGetSecureConversionStatus: () => ({ data: mocks.status, isLoading: false, refetch: vi.fn() }),
  useRunSecureConversionPreflight: () => ({ mutate: mocks.preflight, data: mocks.preflightData, isPending: false }),
  useStartSecureConversion: () => ({ mutate: mocks.start, isPending: false }),
  useRetrySecureConversion: () => ({ mutate: mocks.retry, isPending: false }),
  useCancelSecureConversion: () => ({ mutateAsync: mocks.cancel, isPending: false }),
}));
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // Tooltip content shows on hover only; render it inline so the reasons can be asserted.
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: () => ({ t: (key: string) => key }),
  StatusDialog: ({
    isOpen,
    children,
    action,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    action?: { label: React.ReactNode; onPress: () => void };
  }) =>
    isOpen ? (
      <div>
        {children}
        {action && <button onClick={action.onPress}>{action.label}</button>}
      </div>
    ) : null,
  StandardModal: ({
    children,
    isOpen,
  }: {
    children: (r: { close: () => void }) => React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div>{children({ close: vi.fn() })}</div> : null),
}));

const reader = {
  id: 7,
  name: 'Front door',
  secured: false,
  firmwareProfile: 'plain',
  firmware: { name: 'attractap', variant: 'touch-v2' },
} as unknown as Attractap;

const conversion = (state: string, extra: Record<string, unknown> = {}) => ({
  id: 3,
  readerId: 7,
  state,
  failureReason: null,
  bytesDone: 0,
  bytesTotal: 0,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canManage = true;
  mocks.eligibility = { hidden: false, blockers: [] };
  mocks.status = { conversion: null, online: true, canCancel: false, canRetry: false, signingKeyAvailable: null };
  mocks.preflightData = undefined;
});

const button = () => screen.getByRole('button', { name: /button/ });

describe('SecureThisReader', () => {
  it('is hidden entirely while the variant is not hardware-tested', () => {
    mocks.eligibility = { hidden: true, blockers: ['not-hardware-tested', 'reader-offline'] };
    const { container } = render(<SecureThisReader reader={reader} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    'recovery-check-missing',
    'reader-unpaired',
    'reader-offline',
    'no-secure-conversion',
    'not-release-build',
    'demo-or-debug-variant',
    'conversion-running',
  ])('is disabled with the reason when %s', (blocker) => {
    mocks.eligibility = { hidden: false, blockers: [blocker] };
    render(<SecureThisReader reader={reader} />);
    expect(button()).toBeDisabled();
    expect(screen.getByText(`blocker.${blocker}`)).toBeInTheDocument();
  });

  it('shows nothing for a secured reader without a conversion, not an empty heading', () => {
    mocks.eligibility = { hidden: false, blockers: ['already-secured'] };
    mocks.status = { ...mocks.status, signingKeyAvailable: true };
    const { container } = render(<SecureThisReader reader={{ ...reader, secured: true } as Attractap} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the missing permission when the variant is tested, and stays hidden otherwise', () => {
    mocks.canManage = false;
    mocks.eligibility = { hidden: true, blockers: ['missing-permission'] };
    const { container, rerender } = render(<SecureThisReader reader={reader} />);
    expect(container).toBeEmptyDOMElement();
    mocks.eligibility = { hidden: false, blockers: ['missing-permission'] };
    rerender(<SecureThisReader reader={reader} />);
    expect(button()).toBeDisabled();
    expect(screen.getByText('blocker.missing-permission')).toBeInTheDocument();
  });

  it('asks for the risk confirmation, the typed name and a passing preflight before Start', async () => {
    const view = render(<SecureThisReader reader={reader} />);
    await userEvent.click(button());
    expect(screen.getByText('risk.brickWindows')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'risk.continue' }));

    const runPreflight = screen.getByRole('button', { name: 'start.runPreflight' });
    expect(runPreflight).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'Front doo');
    expect(runPreflight).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'r');
    expect(runPreflight).toBeEnabled();
    await userEvent.click(runPreflight);
    expect(mocks.preflight).toHaveBeenCalledWith({ path: { id: 7 } });
    expect(screen.getByRole('button', { name: 'start.start' })).toBeDisabled();

    mocks.preflightData = { ok: true, checks: [{ check: 'flash-size', ok: true, value: '16 MB' }] };
    view.rerender(<SecureThisReader reader={reader} />);
    expect(screen.getByText('check.flash-size')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'start.start' }));
    expect(mocks.start).toHaveBeenCalledWith({ path: { id: 7 }, body: { confirmName: 'Front door' } });
  });

  it('keeps Start disabled when a preflight check failed', async () => {
    mocks.preflightData = { ok: false, checks: [{ check: 'key-blocks', ok: false, value: null }] };
    render(<SecureThisReader reader={reader} />);
    await userEvent.click(button());
    await userEvent.click(screen.getByRole('button', { name: 'risk.continue' }));
    await userEvent.type(screen.getByRole('textbox'), 'Front door');
    expect(screen.getByText('start.preflightFailed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'start.start' })).toBeDisabled();
  });

  it('shows the failure reason and offers Retry when it is safe', async () => {
    mocks.status = {
      ...mocks.status,
      conversion: conversion('failed', { failureReason: 'verify-failed' }),
      canRetry: true,
    };
    render(<SecureThisReader reader={reader} />);
    expect(screen.getByText('failure.verify-failed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'progress.retry' }));
    expect(mocks.retry).toHaveBeenCalledWith({ path: { id: 7 } });
  });

  it('shows progress and Cancel while transferring, and no Start button', () => {
    mocks.status = {
      ...mocks.status,
      conversion: conversion('transferring', { bytesDone: 50, bytesTotal: 200 }),
      canCancel: true,
    };
    render(<SecureThisReader reader={reader} />);
    expect(screen.getByText('25 %')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'progress.cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /button/ })).toBeNull();
  });

  it.each(['digests-burned', 'bootloader-written', 'encrypting', 'migrating'])('warns not to unplug in %s', (state) => {
    mocks.status = { ...mocks.status, conversion: conversion(state) };
    render(<SecureThisReader reader={reader} />);
    expect(screen.getByText('progress.dontUnplug')).toBeInTheDocument();
  });

  it('warns about a possible brick when interrupted', () => {
    mocks.status = { ...mocks.status, conversion: conversion('interrupted'), online: false };
    render(<SecureThisReader reader={reader} />);
    expect(screen.getByText('interrupted.message')).toBeInTheDocument();
  });

  it('says when no held key can sign updates for the reader', () => {
    mocks.status = { ...mocks.status, signingKeyAvailable: false };
    render(<SecureThisReader reader={{ ...reader, secured: true } as Attractap} />);
    expect(screen.getByText('noSigningKey')).toBeInTheDocument();
  });
});
