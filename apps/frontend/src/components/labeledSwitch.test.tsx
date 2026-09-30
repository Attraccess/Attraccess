import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LabeledSwitch } from './labeledSwitch';

// Regression tests for ATT-729: after the HeroUI 3.0 -> 3.2 bump, only
// Switch.Content (a SwitchButton <label>) is interactive. The control (track)
// must be nested inside it, otherwise clicking the visible switch does nothing.
describe('LabeledSwitch', () => {
  it('renders the control inside the interactive content label', () => {
    const { container } = render(
      <LabeledSwitch isSelected={false} onChange={vi.fn()}>
        My label
      </LabeledSwitch>
    );

    const control = container.querySelector('[data-slot="switch-control"]');
    expect(control).not.toBeNull();
    expect((control as HTMLElement).closest('[data-slot="switch-content"]')).not.toBeNull();
  });

  it('toggles when the switch control (track) is clicked', () => {
    const onChange = vi.fn();
    const { container } = render(
      <LabeledSwitch isSelected={false} onChange={onChange}>
        My label
      </LabeledSwitch>
    );

    fireEvent.click(container.querySelector('[data-slot="switch-control"]') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles when the control is clicked and there is no label', () => {
    const onChange = vi.fn();
    const { container } = render(<LabeledSwitch isSelected={false} onChange={onChange} aria-label="No label" />);

    fireEvent.click(container.querySelector('[data-slot="switch-control"]') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles when the label text is clicked', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <LabeledSwitch isSelected={false} onChange={onChange}>
        My label
      </LabeledSwitch>
    );

    fireEvent.click(getByText('My label'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
