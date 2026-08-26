import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SettingsSaveBar } from './SettingsSaveBar';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key.split('.').pop() ?? key }),
}));

describe('SettingsSection', () => {
  it('renders no aside slot at all when none is passed', () => {
    // An empty `<aside>` still occupies a grid track and pushes the content column narrow.
    const { container } = render(
      <SettingsSection title="General">
        <p>body</p>
      </SettingsSection>,
    );

    expect(container.querySelector('[data-slot="settings-aside"]')).toBeNull();
  });

  it('renders the aside when one is passed', () => {
    const { container } = render(
      <SettingsSection title="Monitoring" aside={<p>endpoint</p>}>
        <p>body</p>
      </SettingsSection>,
    );

    expect(container.querySelector('[data-slot="settings-aside"]')).toBeInTheDocument();
    expect(screen.getByText('endpoint')).toBeInTheDocument();
  });
});

describe('SettingsRow', () => {
  it('gives each row its own flex context so a wrapping label cannot drag its neighbours', () => {
    const { container } = render(
      <>
        <SettingsRow label="A label long enough to wrap" hint="hint">
          <button type="button">control a</button>
        </SettingsRow>
        <SettingsRow label="B">
          <button type="button">control b</button>
        </SettingsRow>
      </>,
    );

    const rows = container.querySelectorAll('[data-slot="settings-row"]');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.className).toContain('flex');
      expect(row.className).toContain('items-start');
    }
  });

  it('stacks the control under the label in the stacked variant', () => {
    const { container } = render(
      <SettingsRow stacked label="URL">
        <input aria-label="url" />
      </SettingsRow>,
    );

    expect(container.querySelector('[data-slot="settings-row"]')?.className).toContain('flex-col');
  });
});

describe('SettingsSaveBar', () => {
  it('renders nothing while clean', () => {
    const { container } = render(
      <SettingsSaveBar isDirty={false} onSave={vi.fn()} onDiscard={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers Discard and Save once dirty', async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<SettingsSaveBar isDirty onSave={onSave} onDiscard={onDiscard} />);

    await userEvent.click(screen.getByRole('button', { name: 'discard' }));
    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });
});
