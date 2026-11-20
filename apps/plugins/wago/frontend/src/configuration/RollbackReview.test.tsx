import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RevisionPreview } from '../api/client';
import { RollbackReview } from './RollbackReview';

const channel = {
  id: 'output',
  physicalPointId: 'relay',
  profile: 'generic-digital-output',
  capabilities: ['output'],
  disconnectPolicy: { mode: 'hold' },
};
const snapshot = {
  version: 1,
  physicalPoints: [{ id: 'relay', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [channel],
};
const preview = (extra: Partial<RevisionPreview> = {}): RevisionPreview => ({
  draftHash: 'draft-hash',
  revision: {
    revision: 1,
    contentHash: 'hash-1',
    state: 'applied',
    rejectionErrors: null,
    publishedAt: '2026-09-30T10:00:00.000Z',
    reportedAt: '2026-09-30T10:01:00.000Z',
    snapshot: JSON.stringify(snapshot),
  },
  current: null,
  diff: [{ path: '$', previous: null, current: snapshot }],
  impacts: [],
  ...extra,
});

function renderReview(value: RevisionPreview, onPublish = vi.fn()) {
  render(
    <RollbackReview
      preview={value}
      names={{ output: 'Laser power' }}
      force={false}
      onForceChange={vi.fn()}
      disabled={false}
      busy={false}
      onPublish={onPublish}
      onCancel={vi.fn()}
    />,
  );
  return onPublish;
}

beforeEach(() => useTranslationState.setState({ language: 'en' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('reviews a rollback when the controller has no current revision', () => {
  const onPublish = renderReview(preview({ current: null }));
  expect(screen.getByText('Restore revision 1 as a new revision')).toBeTruthy();
  expect(screen.getAllByText(/^Before:/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/^After:/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Publish rollback as new revision' }));
  expect(onPublish).toHaveBeenCalledTimes(1);
});

it('lists the name and preset changes of a rollback with their before and after values', () => {
  renderReview(preview({ metadataDiff: [{ path: '$.names.output', previous: 'Laser power', current: 'Air assist' }] }));
  const section = within(screen.getByRole('region', { name: 'Names and presets' }));
  expect(section.getByRole('heading', { name: 'Names and presets' })).toBeTruthy();
  expect(section.getByText('Name for Laser power')).toBeTruthy();
  expect(section.getByText('Before: Laser power')).toBeTruthy();
  expect(section.getByText('After: Air assist')).toBeTruthy();
});

it.each([[undefined], [[]]])('shows no names section without a metadata diff (%j)', (metadataDiff) => {
  renderReview(preview({ metadataDiff }));
  expect(screen.queryByRole('region', { name: 'Names and presets' })).toBeNull();
});

it('keeps publication disabled until the flow impacts are acknowledged', () => {
  renderReview(preview({ impacts: [{ channelId: 'output', message: 'Channel removed.', references: [] }] }));
  expect(screen.getByRole('button', { name: 'Publish rollback as new revision' }).hasAttribute('disabled')).toBe(true);
});
