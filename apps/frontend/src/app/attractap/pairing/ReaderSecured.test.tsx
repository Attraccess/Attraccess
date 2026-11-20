import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attractap } from '@attraccess/react-query-client';
import { ReaderSecured } from './ReaderSecured';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => (value: string) => `at ${value}`,
}));

const reader = (overrides: Partial<Attractap>) =>
  ({
    id: 7,
    name: 'Door',
    secured: false,
    securedAt: null,
    firmwareProfile: null,
    secureVersion: null,
    efuseSecureVersion: null,
    securityReportCheckedAt: null,
    securityReportProblems: null,
    ...overrides,
  }) as Attractap;

describe('ReaderSecured', () => {
  it.each([null, 'plain'] as const)('shows nothing for a reader with the %s profile', (firmwareProfile) => {
    const { container } = render(<ReaderSecured reader={reader({ firmwareProfile })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a secured reader without problems', () => {
    render(
      <ReaderSecured
        reader={reader({
          firmwareProfile: 'secure',
          secured: true,
          securityReportCheckedAt: '2026-11-18T10:00:00.000Z',
          securityReportProblems: [],
        })}
      />,
    );
    expect(screen.getByText('secured.secured')).toBeInTheDocument();
    expect(screen.getByText(/secured.checkedAt/)).toHaveTextContent('at 2026-11-18T10:00:00.000Z');
    expect(document.querySelector('[data-cy="attractap-secured-problems"]')).toBeNull();
  });

  it('lists what does not match for a lab build, which is expected to be not secured', () => {
    render(
      <ReaderSecured
        reader={reader({
          firmwareProfile: 'secure-lab',
          securityReportCheckedAt: '2026-11-18T10:00:00.000Z',
          securityReportProblems: ['profile-not-secure', 'flash-encryption-not-release'],
        })}
      />,
    );
    expect(screen.getByText('secured.notSecured')).toBeInTheDocument();
    expect(screen.getByText('secured.profile.secure-lab')).toBeInTheDocument();
    expect(screen.getByText('secured.problem.profile-not-secure')).toBeInTheDocument();
    expect(screen.getByText('secured.problem.flash-encryption-not-release')).toBeInTheDocument();
  });

  it('says so when no report arrived yet', () => {
    render(<ReaderSecured reader={reader({ firmwareProfile: 'secure' })} />);
    expect(screen.getByText('secured.notChecked')).toBeInTheDocument();
  });
});
