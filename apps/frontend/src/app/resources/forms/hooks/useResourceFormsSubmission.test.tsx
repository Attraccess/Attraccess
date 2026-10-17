import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormFieldType, type FormResponseDto } from '@attraccess/react-query-client';
import { useResourceFormsSubmission } from './useResourceFormsSubmission';

const { requirements, submitted } = vi.hoisted(() => ({ requirements: vi.fn(), submitted: vi.fn() }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  ResourceFormsService: { resourceFormsGetRequirements: requirements },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const forms = [
  {
    id: 7,
    name: 'Safety',
    fields: [
      { id: 1, name: 'Notes', type: FormFieldType.TEXT, options: { placeholder: 'Notes' } },
      { id: 2, name: 'Temperature', type: FormFieldType.NUMBER },
      { id: 3, name: 'Confirmed', type: FormFieldType.BOOLEAN },
    ],
  },
] as FormResponseDto[];

function Harness({ resourceId = 1 }) {
  const { requestForms, modal, clearFormsDraft } = useResourceFormsSubmission(resourceId);
  return (
    <>
      <button
        onClick={() =>
          void requestForms('start')
            .then(submitted)
            .catch(() => undefined)
        }
      >
        Start
      </button>
      <button
        onClick={() =>
          void requestForms('end')
            .then(submitted)
            .catch(() => undefined)
        }
      >
        End
      </button>
      <button onClick={clearFormsDraft}>Operation succeeded</button>
      {modal}
    </>
  );
}
async function enterAndSubmit() {
  fireEvent.change(await screen.findByPlaceholderText('Notes'), { target: { value: 'Keep after failure' } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '21.5' } });
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  await waitFor(() => expect(screen.queryByPlaceholderText('Notes')).toBeNull());
}

it('retains submitted answers for a failed operation retry, then clears them after success', async () => {
  requirements.mockResolvedValue(forms);
  render(<Harness />);
  fireEvent.click(screen.getByText('Start'));
  await enterAndSubmit();
  expect(submitted).toHaveBeenCalledWith([
    {
      formId: 7,
      answers: [
        { fieldId: 1, value: 'Keep after failure' },
        { fieldId: 2, value: 21.5 },
        { fieldId: 3, value: true },
      ],
    },
  ]);
  // The enclosing request failed, so it did not call clearFormsDraft.
  fireEvent.click(screen.getByText('Start'));
  expect(await screen.findByPlaceholderText('Notes')).toHaveValue('Keep after failure');
  expect(screen.getByRole('spinbutton')).toHaveValue(21.5);
  expect(screen.getByRole('switch')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  await waitFor(() => expect(submitted).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByText('Operation succeeded'));
  fireEvent.click(screen.getByText('Start'));
  expect(await screen.findByPlaceholderText('Notes')).toHaveValue('');
  expect(screen.getByRole('switch')).not.toBeChecked();
});

it('does not reuse answers for another action or resource, and discards a cancelled retry', async () => {
  requirements.mockResolvedValue(forms);
  const view = render(<Harness />);
  fireEvent.click(screen.getByText('Start'));
  await enterAndSubmit();
  fireEvent.click(screen.getByText('End'));
  expect(await screen.findByPlaceholderText('Notes')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'modal.cancel' }));
  fireEvent.click(screen.getByText('Start'));
  expect(await screen.findByPlaceholderText('Notes')).toHaveValue('');
  await enterAndSubmit();
  view.rerender(<Harness resourceId={2} />);
  fireEvent.click(screen.getByText('Start'));
  expect(await screen.findByPlaceholderText('Notes')).toHaveValue('');
  expect(requirements).toHaveBeenLastCalledWith({ resourceId: 2, action: 'start' });
});
