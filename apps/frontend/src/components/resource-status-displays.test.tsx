import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MaintenanceReasonDisplay } from './MaintenanceReasonDisplay';
import { ResourceIntroducersList } from './ResourceIntroducersList';
import { RetrainingStatusBanner } from '../app/resources/usage/components/RetrainingStatusBanner';
const state = vi.hoisted(() => ({
  loading: false,
  introducers: undefined as undefined | { id: number; user: { username: string } }[],
  status: undefined as undefined | { applies: boolean; isDue: boolean; blocksAccess: boolean; reason?: string },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAccessControlServiceResourceIntroducersGetMany: () => ({ data: state.introducers, isLoading: state.loading }),
  useResourcesServiceResourceRetrainingGetStatus: () => ({ data: state.status }),
}));
beforeEach(() => {
  state.loading = false;
  state.introducers = undefined;
  state.status = undefined;
});
afterEach(cleanup);
it.each([
  [null, 'reason.noReason'],
  ['', 'reason.noReason'],
  ['Manual inspection', 'Manual inspection'],
  ['{bad', '{bad'],
  ['null', 'null'],
  ['{"other":"value"}', '{"other":"value"}'],
  ['{"i18nKey":"due.hours","details":{"hours":20}}', 'due.hours:{"hours":20}'],
])('formats maintenance reason %s', (reason, expected) => {
  render(<MaintenanceReasonDisplay reason={reason} />);
  expect(screen.getByText(expected as string)).toBeTruthy();
});
it('supports a caller supplied empty reason', () => {
  render(<MaintenanceReasonDisplay reason={undefined} fallback="No details supplied" />);
  expect(screen.getByText('No details supplied')).toBeTruthy();
});
it('shows loading, empty and populated introducer lists', () => {
  state.loading = true;
  let view = render(<ResourceIntroducersList resourceId={7} />);
  expect(screen.queryByText('empty')).toBeNull();
  view.unmount();
  state.loading = false;
  view = render(<ResourceIntroducersList resourceId={7} emptyText="No instructors" />);
  expect(screen.getByText('No instructors')).toBeTruthy();
  view.unmount();
  state.introducers = [
    { id: 1, user: { username: 'Ada' } },
    { id: 2, user: { username: 'Ben' } },
  ];
  render(<ResourceIntroducersList resourceId={7} title="Contact instructors" />);
  expect(screen.getByText('Contact instructors:')).toBeTruthy();
  expect(screen.getByText('Ada')).toBeTruthy();
  expect(screen.getByText('Ben')).toBeTruthy();
});
it.each([
  undefined,
  { applies: false, isDue: true, blocksAccess: false },
  { applies: true, isDue: false, blocksAccess: false },
])('hides retraining notices when they do not apply', (status) => {
  state.status = status;
  const view = render(<RetrainingStatusBanner resourceId={7} />);
  expect(view.container).toBeEmptyDOMElement();
});
it.each([
  [false, 'age', 'due.title', 'due.description reason.age'],
  [true, 'inactivity', 'blocked.title', 'blocked.description reason.inactivity'],
] as const)('explains retraining status and access blocking %s', (blocksAccess, reason, title, description) => {
  state.status = { applies: true, isDue: true, blocksAccess, reason };
  render(<RetrainingStatusBanner resourceId={7} />);
  expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText(description)).toBeTruthy();
});
