// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useDateTimePreferences } from '@attraccess/plugins-frontend-ui';
import { LocaleDateField } from './localeDateField';
import { filterRequest, emptyFilters } from '../app/settings/sections/audit-log/audit-log-model';

afterEach(() => {
  cleanup();
  useDateTimePreferences.setState({ dateTimeLocale: null });
});
it('keeps edited date values Gregorian across locale and calendar changes', async () => {
  const user = userEvent.setup();
  useDateTimePreferences.setState({ dateTimeLocale: 'en-GB' });
  const onChange = vi.fn();
  const view = render(
    <LocaleDateField clearLabel="Clear date" label="Expiry" value="2026-11-23" onChange={onChange} />,
  );
  const day = screen.getByRole('spinbutton', { name: /day/i });
  await user.click(day);
  await user.keyboard('{ArrowUp}');
  expect(onChange).toHaveBeenLastCalledWith('2026-11-24');
  act(() => useDateTimePreferences.setState({ dateTimeLocale: 'th-TH-u-ca-buddhist' }));
  view.rerender(<LocaleDateField clearLabel="Clear date" label="Expiry" value="2026-11-23" onChange={onChange} />);
  await user.click(screen.getAllByRole('spinbutton')[0]);
  await user.keyboard('{ArrowUp}');
  expect(onChange).toHaveBeenLastCalledWith('2026-11-24');
});
it('edits wall-clock time without applying a locale timezone, and clears an optional filter', async () => {
  const user = userEvent.setup();
  useDateTimePreferences.setState({ dateTimeLocale: 'en-US' });
  const onChange = vi.fn();
  render(
    <LocaleDateField clearLabel="Clear date" label="From" value="2026-11-23T17:45" onChange={onChange} withTime />,
  );
  await user.click(screen.getByRole('spinbutton', { name: /minute/i }));
  await user.keyboard('{ArrowUp}');
  expect(onChange).toHaveBeenLastCalledWith('2026-11-23T17:46:00');
  expect(filterRequest({ ...emptyFilters, from: onChange.mock.lastCall?.[0] }).request?.from).toBe(
    new Date('2026-11-23T17:46').toISOString(),
  );
  await user.click(screen.getByRole('button', { name: 'Clear date' }));
  expect(onChange).toHaveBeenCalledWith('');
});
