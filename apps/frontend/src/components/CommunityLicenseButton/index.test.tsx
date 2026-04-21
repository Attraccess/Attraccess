import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommunityLicenseButton, COMMUNITY_LICENSE_KEY, LICENSE_URL } from './index';
import { TestWrapper } from '../../test-utils/wrappers';

vi.mock('@attraccess/plugins-frontend-ui', async () => {
  const React = await import('react');
  const translations: Record<string, string> = {
    button: 'Use community / non-profit license',
    'modal.title': 'Confirm community / non-profit use',
    'modal.question':
      'Are you a private user or non-profit organization and do you agree to the <link>Prosperity Public License</link> terms?',
    'modal.commercialNotice': 'Commercial use beyond the 30-day trial requires a paid license key.',
    'modal.cancel': 'Cancel',
    'modal.confirm': 'Yes, I qualify',
  };

  const useTranslations = () => {
    const t = (key: string) => translations[key] ?? key;
    const tExists = (key: string) => Boolean(translations[key]);
    return { t, tExists };
  };

  const I18nTransComponent = ({
    t,
    i18nKey,
    components,
  }: {
    t: (key: string) => string;
    i18nKey: string;
    components?: Record<string, React.ReactElement>;
  }) => {
    const raw = t(i18nKey);
    const match = raw.match(/^([\s\S]*?)<(\w+)>([\s\S]*?)<\/\2>([\s\S]*)$/);
    if (!match || !components?.[match[2]]) {
      return React.createElement(React.Fragment, null, raw);
    }
    const [, before, tag, inner, after] = match;
    return React.createElement(
      React.Fragment,
      null,
      before,
      React.cloneElement(components[tag], { key: tag }, inner),
      after,
    );
  };

  return { useTranslations, I18nTransComponent };
});

describe('CommunityLicenseButton', () => {
  it('renders the button label', () => {
    render(<CommunityLicenseButton onAccept={vi.fn()} />, { wrapper: TestWrapper });
    expect(screen.getByRole('button', { name: /Use community \/ non-profit license/i })).toBeInTheDocument();
  });

  it('opens the modal with PPL link and commercial notice when clicked', async () => {
    const user = userEvent.setup();
    render(<CommunityLicenseButton onAccept={vi.fn()} />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: /Use community \/ non-profit license/i }));

    expect(await screen.findByText(/Confirm community \/ non-profit use/i)).toBeInTheDocument();
    expect(screen.getByText(/Commercial use beyond the 30-day trial requires a paid license key\./i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Prosperity Public License/i });
    expect(link).toHaveAttribute('href', LICENSE_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('calls onAccept with the community license string on confirm', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<CommunityLicenseButton onAccept={onAccept} />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: /Use community \/ non-profit license/i }));
    await user.click(await screen.findByRole('button', { name: /Yes, I qualify/i }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(COMMUNITY_LICENSE_KEY);
  });

  it('does not call onAccept when cancelled', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<CommunityLicenseButton onAccept={onAccept} />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: /Use community \/ non-profit license/i }));
    await user.click(await screen.findByRole('button', { name: /^Cancel$/i }));

    expect(onAccept).not.toHaveBeenCalled();
  });
});
