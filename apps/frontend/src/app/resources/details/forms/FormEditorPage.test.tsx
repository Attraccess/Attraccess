import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TestWrapper } from '../../../../test-utils/wrappers';
import { FormEditorPage } from './FormEditorPage';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  useResourcesServiceGetOneResourceById: () => ({ data: { id: 7, name: 'Laser Cutter' } }),
  useResourceFormsServiceResourceFormsGetOne: () => ({ data: undefined, isLoading: false }),
  useResourceFormsServiceResourceFormsCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResourceFormsServiceResourceFormsUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResourceFormsServiceResourceFormsDelete: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderEditor() {
  return render(
    <TestWrapper
      initialRoute="/resources/7/forms/new"
      routes={<Route path="/resources/:id/forms/:formId" element={<FormEditorPage />} />}
    />
  );
}

const fieldTrigger = () =>
  screen
    .getAllByRole('button', { expanded: undefined })
    .find((b) => /^#1/.test(b.textContent ?? '')) as HTMLElement;

describe('FormEditorPage field accordion', () => {
  // Regression for the drag-and-drop reorder change (#1676): AccordionTrigger carried its own
  // onPress *and* the Accordion toggled via onExpandedChange, so every click toggled twice and
  // the panel never visibly opened or closed.
  it('expands and collapses a field when its header is clicked', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(document.querySelector('[data-cy="form-editor-add-field-button"]') as HTMLElement);

    const trigger = fieldTrigger();
    // a freshly added field starts expanded
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(fieldTrigger()).toHaveAttribute('aria-expanded', 'false');

    await user.click(fieldTrigger());
    expect(fieldTrigger()).toHaveAttribute('aria-expanded', 'true');
  });

  // The drag grip is nested inside the trigger; its presses must not bubble up and toggle
  // the panel (they would otherwise toggle on every grab and after every reorder).
  it('does not toggle the field when the drag grip is clicked', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(document.querySelector('[data-cy="form-editor-add-field-button"]') as HTMLElement);
    expect(fieldTrigger()).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'editor.reorderField' }));
    expect(fieldTrigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
