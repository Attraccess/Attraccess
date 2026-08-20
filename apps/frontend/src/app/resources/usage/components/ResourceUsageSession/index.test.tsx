import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceUsageSession } from './index';
import { createMockResource } from '../../../../../test-utils/fixtures';
import { SupervisionMode } from '@attraccess/react-query-client';

const { canControl, hasPermission, loading } = vi.hoisted(() => ({
  canControl: { value: true },
  hasPermission: { value: false },
  loading: { activeSession: false, canControl: false, introducers: false },
}));

vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, username: 'me' }, hasPermission: () => hasPermission.value }),
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));

vi.mock('../../../../../utils/sse', () => ({ useSSE: () => undefined }));

// The child components are irrelevant here — we only assert which branch renders.
vi.mock('../StartSessionControls', () => ({
  StartSessionControls: ({ requiresSupervision }: { requiresSupervision?: boolean }) => (
    <div data-testid="start-controls" data-requires-supervision={String(!!requiresSupervision)} />
  ),
}));
vi.mock('../IntroductionRequiredDisplay', () => ({
  IntroductionRequiredDisplay: () => <div data-testid="introduction-required" />,
}));
vi.mock('../ActiveSessionDisplay', () => ({ ActiveSessionDisplay: () => null }));
vi.mock('../OtherUserSessionDisplay', () => ({ OtherUserSessionDisplay: () => null }));
vi.mock('../RetrainingStatusBanner', () => ({ RetrainingStatusBanner: () => null }));
vi.mock('./maintenance', () => ({ MaintenanceInProgressDisplay: () => null }));
vi.mock('../../../details/maintenance-management/request', () => ({ RequestMaintenanceButton: () => null }));
vi.mock('../../../details/maintenance-management/instant', () => ({ InstantMaintenanceButton: () => null }));

vi.mock('@attraccess/react-query-client', async () => ({
  SupervisionMode: {
    INTRODUCTION_REQUIRED: 'introduction_required',
    SUPERVISION_ALLOWED: 'supervision_allowed',
    SUPERVISION_REQUIRED: 'supervision_required',
  },
  ResourceType: { MACHINE: 'machine', DOOR: 'door' },
  useResourcesServiceResourceUsageCanControl: () => ({
    data: { canControl: canControl.value },
    isLoading: loading.canControl,
  }),
  useResourcesServiceResourceUsageCanControlKey: 'canControl',
  useAccessControlServiceResourceIntroducersGetMany: () => ({ data: [], isLoading: loading.introducers }),
  useResourcesServiceResourceUsageGetActiveSession: () => ({
    data: { usage: null },
    isLoading: loading.activeSession,
  }),
  useResourcesServiceResourceUsageGetActiveSessionKey: 'activeSession',
  useResourceMaintenancesServiceFindMaintenances: () => ({ data: { data: [] } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function renderSession(supervisionMode: SupervisionMode) {
  const resource = createMockResource({ id: 7, supervisionMode });
  return render(<ResourceUsageSession resourceId={7} resource={resource} />);
}

// This component decides *routing* only: introduction gate vs. start controls, and whether the user
// can start solo. Whether supervision_required forces a supervisor is decided inside
// StartSessionControls (see its own test) so that every call site inherits it — ATT-815.
describe('ResourceUsageSession routing', () => {
  beforeEach(() => {
    canControl.value = true;
    hasPermission.value = false;
    loading.activeSession = false;
    loading.canControl = false;
    loading.introducers = false;
  });

  it('lets an introduced user start solo on supervision_allowed', () => {
    renderSession(SupervisionMode.SUPERVISION_ALLOWED);

    expect(screen.getByTestId('start-controls')).toHaveAttribute('data-requires-supervision', 'false');
  });

  it('requires supervision on supervision_allowed when the user is not introduced', () => {
    canControl.value = false;

    renderSession(SupervisionMode.SUPERVISION_ALLOWED);

    expect(screen.getByTestId('start-controls')).toHaveAttribute('data-requires-supervision', 'true');
  });

  it('offers the start controls on supervision_required rather than the introduction gate', () => {
    canControl.value = false;

    renderSession(SupervisionMode.SUPERVISION_REQUIRED);

    expect(screen.getByTestId('start-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('introduction-required')).not.toBeInTheDocument();
  });

  it('still shows the introduction gate on introduction_required', () => {
    canControl.value = false;

    renderSession(SupervisionMode.INTRODUCTION_REQUIRED);

    expect(screen.getByTestId('introduction-required')).toBeInTheDocument();
  });

  it.each(['canControl', 'introducers'] as const)(
    'waits for the access decision while %s is loading before showing the introduction gate',
    (loadingState) => {
      canControl.value = false;
      loading[loadingState] = true;

      renderSession(SupervisionMode.INTRODUCTION_REQUIRED);

      expect(document.querySelector('[data-slot="spinner"]')).toBeInTheDocument();
      expect(screen.queryByTestId('introduction-required')).not.toBeInTheDocument();
    },
  );
});
