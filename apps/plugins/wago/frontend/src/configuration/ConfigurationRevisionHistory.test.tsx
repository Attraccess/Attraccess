import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConfigurationRevision, ConfigurationRevisionPage } from '../api/client';
import { ConfigurationRevisionHistory } from './ConfigurationRevisionHistory';

vi.mock('./RejectionErrors', () => ({ RejectionErrors: () => null }));

const rejected = (extra: Partial<ConfigurationRevision> = {}): ConfigurationRevision => ({
  revision: 2,
  contentHash: 'hash-2',
  state: 'rejected',
  rejectionErrors: null,
  publishedAt: '2026-09-30T10:00:00.000Z',
  reportedAt: '2026-09-30T10:01:00.000Z',
  ...extra,
});

function renderHistory(revision: ConfigurationRevision) {
  const history = {
    isPending: false,
    isError: false,
    data: { revisions: [revision], offset: 0, limit: 20 } as ConfigurationRevisionPage,
  } as UseQueryResult<ConfigurationRevisionPage>;
  render(
    <ConfigurationRevisionHistory
      history={history}
      controllerId={1}
      metadata={{ names: {}, presets: [] }}
      disabled={false}
      busy={false}
      offset={0}
      onOffsetChange={vi.fn()}
      preview={undefined}
      rollbackNames={{}}
      rollbackForce={false}
      onRollbackForceChange={vi.fn()}
      onAcknowledge={vi.fn()}
      onPreviewRollback={vi.fn()}
      onCancelPreview={vi.fn()}
      onPublishRollback={vi.fn()}
    />,
  );
  return within(screen.getByRole('region', { name: 'Revision 2' }));
}

beforeEach(() => useTranslationState.setState({ language: 'en' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows an acknowledgement by an unknown user and offers no second acknowledgement', () => {
  const section = renderHistory(
    rejected({ rejectionAcknowledgedAt: '2026-09-30T10:02:00.000Z', rejectionAcknowledgedBy: null }),
  );
  expect(section.getByText('Rejection acknowledged by user unknown.')).toBeTruthy();
  expect(section.queryByRole('button', { name: /Acknowledge rejection/ })).toBeNull();
});

it('shows who acknowledged a rejection', () => {
  const section = renderHistory(
    rejected({ rejectionAcknowledgedAt: '2026-09-30T10:02:00.000Z', rejectionAcknowledgedBy: 7 }),
  );
  expect(section.getByText('Rejection acknowledged by user 7.')).toBeTruthy();
});
