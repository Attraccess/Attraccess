import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutoIntroductionTarget, SupervisionMode, type UpdateResourceDto } from '@attraccess/react-query-client';
import { SupervisionTab } from './supervision';
const query = vi.hoisted(() => vi.fn());
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceResourceGroupsGetMany: (...args: unknown[]) => {
    query(...args);
    return { data: [{ id: 3, name: 'Workshop' }], isLoading: false };
  },
}));
beforeEach(() => {
  query.mockClear();
});
afterEach(cleanup);
function Editor({ initial }: { initial: UpdateResourceDto }) {
  const [formData, setData] = useState(initial);
  return (
    <>
      <SupervisionTab
        t={(key) => key}
        formData={formData}
        setField={(field, value) => setData((current) => ({ ...current, [field]: value }))}
      />
      <output data-testid="data">{JSON.stringify(formData)}</output>
    </>
  );
}
const data = () => JSON.parse(screen.getByTestId('data').textContent ?? '{}');
it('enables auto-introduction with an integer threshold and clears dependent settings when disabled', () => {
  render(<Editor initial={{ supervisionMode: SupervisionMode.SUPERVISION_ALLOWED }} />);
  fireEvent.change(screen.getByLabelText('inputs.supervision.autoPromotion.threshold.label'), {
    target: { value: '2.8' },
  });
  expect(data()).toMatchObject({
    supervisedUsagesUntilIntroduction: 2,
    autoIntroductionTarget: AutoIntroductionTarget.RESOURCE,
  });
  fireEvent.change(screen.getByLabelText('inputs.supervision.autoPromotion.threshold.label'), {
    target: { value: '' },
  });
  expect(data()).toMatchObject({
    supervisedUsagesUntilIntroduction: null,
    autoIntroductionTarget: null,
    autoIntroductionGroupId: null,
  });
  expect(query).toHaveBeenLastCalledWith(undefined, { enabled: false });
});
it('loads group choices only for enabled group promotion and clears the group on resource targeting', async () => {
  render(
    <Editor
      initial={{
        supervisionMode: SupervisionMode.SUPERVISION_REQUIRED,
        supervisedUsagesUntilIntroduction: 3,
        autoIntroductionTarget: AutoIntroductionTarget.GROUP,
        autoIntroductionGroupId: 3,
      }}
    />,
  );
  expect(query).toHaveBeenLastCalledWith(undefined, { enabled: true });
  expect((await screen.findAllByText('Workshop')).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('radio', { name: 'inputs.supervision.autoPromotion.target.options.resource' }));
  await waitFor(() =>
    expect(data()).toMatchObject({
      autoIntroductionTarget: AutoIntroductionTarget.RESOURCE,
      autoIntroductionGroupId: null,
    }),
  );
  expect(query).toHaveBeenLastCalledWith(undefined, { enabled: false });
});
it('clears promotion when switching back to mandatory introduction', () => {
  render(
    <Editor
      initial={{
        supervisionMode: SupervisionMode.SUPERVISION_REQUIRED,
        supervisedUsagesUntilIntroduction: 3,
        autoIntroductionTarget: AutoIntroductionTarget.GROUP,
        autoIntroductionGroupId: 3,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('radio', { name: /inputs.supervision.mode.options.introduction_required.label/ }));
  expect(data()).toMatchObject({
    supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    supervisedUsagesUntilIntroduction: null,
    autoIntroductionTarget: null,
    autoIntroductionGroupId: null,
  });
  expect(screen.queryByLabelText('inputs.supervision.autoPromotion.threshold.label')).toBeNull();
});
