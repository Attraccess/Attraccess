import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceUsage } from '@attraccess/react-query-client';
import { SessionProjectSection } from './SessionProjectSection';

const state = vi.hoisted(() => ({
  restricted: new Set<string>(),
  projects: [] as Array<{ id: number; name: string }>,
  mutate: vi.fn(),
  requestForms: vi.fn(),
}));

vi.mock('../../../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => state.restricted.has(action) }),
}));
vi.mock('../../../../../components/networkRestriction/NetworkRestrictedHint', () => ({
  NetworkRestrictedHint: () => <p role="note">onlyLocal</p>,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useFindManyProjects: () => ({ data: { data: state.projects } }),
}));
vi.mock('../../../../../components/projectsSelect', () => ({
  ProjectsSelect: ({ onChange }: { onChange: (id: number | undefined) => void }) => (
    <div>
      <button onClick={() => onChange(undefined)}>pick none</button>
      <button onClick={() => onChange(7)}>pick current</button>
      <button onClick={() => onChange(8)}>pick other</button>
    </div>
  ),
}));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: state.requestForms, modal: null, clearFormsDraft: vi.fn() }),
}));
vi.mock('./useSwitchSessionProject', () => ({
  useSwitchSessionProject: () => ({ mutate: state.mutate, isPending: false, reportError: vi.fn() }),
}));

const usage = (project: { id: number; name: string } | null) => ({ id: 22, project }) as unknown as ResourceUsage;
const mount = (project: { id: number; name: string } | null) =>
  render(<SessionProjectSection resourceId={11} usage={usage(project)} />);
const current = { id: 7, name: 'Rocket' };
const confirmButton = () => screen.getByRole('button', { name: 'dialog.confirm' });

describe('switching the project of the running session', () => {
  beforeEach(() => {
    state.restricted = new Set();
    state.projects = [current, { id: 8, name: 'Boat' }];
    state.mutate.mockReset();
    state.requestForms.mockReset().mockResolvedValue([]);
  });

  it('shows the project the session is booked to', () => {
    mount(current);

    expect(screen.getByText('Rocket')).toBeInTheDocument();
  });

  it('shows nothing to somebody without any project whose session has none', () => {
    state.projects = [];
    const { container } = mount(null);

    expect(container).toBeEmptyDOMElement();
  });

  it('follows the network rule of starting a session', () => {
    state.restricted = new Set(['usage.start']);
    mount(current);

    expect(screen.getByRole('button', { name: 'change' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('onlyLocal');
  });

  it('cannot confirm before another project is picked', async () => {
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));

    expect(confirmButton()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'pick current' }));
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText('dialog.unchanged')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'pick other' }));
    expect(confirmButton()).toBeEnabled();
  });

  it.each([
    ['pick other', 8],
    ['pick none', null],
  ])('asks for the switch forms, then switches the named session (%s)', async (pick, projectId) => {
    const forms = [{ formId: 3, answers: [] }];
    state.requestForms.mockResolvedValue(forms);
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.click(screen.getByRole('button', { name: pick }));
    await user.click(confirmButton());

    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.requestForms).toHaveBeenCalledWith('project-switch');
    expect(state.mutate).toHaveBeenCalledWith({
      path: { resourceId: 11 },
      body: { usageId: 22, projectId, formSubmissions: forms },
    });
  });

  it('keeps the project when the forms are cancelled', async () => {
    state.requestForms.mockRejectedValue(new Error('user_cancelled_forms'));
    const user = userEvent.setup();
    mount(current);
    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.click(screen.getByRole('button', { name: 'pick other' }));
    await user.click(confirmButton());

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
