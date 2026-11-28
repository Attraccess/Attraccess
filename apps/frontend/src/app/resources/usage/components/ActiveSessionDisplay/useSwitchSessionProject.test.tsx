import '@testing-library/jest-dom/vitest';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { getTranslationKeyForApiError, type Props as ApiErrorProps } from '../../../../../utils/apiError';
import { useSwitchSessionProject } from './useSwitchSessionProject';

const state = vi.hoisted(() => ({
  apiError: vi.fn(),
  onError: undefined as undefined | ((error: unknown) => Promise<void>),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useResourceUsageSwitchSessionProject: (_key: unknown, options: { onError: (error: unknown) => Promise<void> }) => {
    state.onError = options.onError;
    return { mutate: vi.fn(), isPending: false };
  },
}));
vi.mock('../../invalidateSwitchedSession', () => ({ invalidateSwitchedSession: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ apiError: state.apiError, success: vi.fn() }),
}));
vi.mock('../../../../../hooks/useRefreshNetworkRestrictionOnError', () => ({
  useRefreshNetworkRestrictionOnError: () => vi.fn(),
}));

/** What the API answers: the status and the JSON body (the client's `message` is only the status text). */
const refused = (status: number, body: Record<string, unknown>) =>
  Object.assign(new Error('Bad Request'), { status, body });
const nest = (status: number, message: string | string[]) => refused(status, { statusCode: status, message });

const NOT_CHANGED = { en: /project was not changed/i, de: /Das Projekt wurde nicht gewechselt/ };

/** The toast as the user reads it, resolved the way `toast.apiError` does it. */
function lastToast() {
  const props = state.apiError.mock.lastCall?.[0] as ApiErrorProps;
  const { key, errorMessage } = getTranslationKeyForApiError(props);
  return { title: props.t(`${key}.title`), description: props.t(`${key}.description`, { error: errorMessage }) };
}

const cases = [
  [
    'a switch flow whose device failed',
    refused(503, {
      statusCode: 503,
      error: 'External effect failed',
      message: 'Request failed with status code 500',
      failureKind: 'node-failure',
    }),
  ],
  ['a flow that refused the switch', nest(422, 'FLOW_EXECUTION_ERROR: Door is open')],
  ['a meter that cannot be read', nest(400, 'METER_SWITCH_FAILED: "Energy": Request failed with status code 500')],
  ['the same project', nest(400, 'The session already belongs to this project')],
  ["somebody else's session", nest(403, 'Only the owner of a running session can switch its project')],
  ['a session that is gone', nest(404, 'No active usage session found')],
  ['a project that is gone', nest(404, 'Project not found')],
  ['a pending session change', nest(409, 'A usage lifecycle operation is already in progress for this resource')],
  ['a busy shared machine', nest(503, 'MachineBusyError')],
  ['an interrupted switch', nest(503, 'SessionChangeInterruptedError')],
  ['a session changed meanwhile', nest(409, 'Usage session changed during the project switch')],
  ['a cancelled continuation', nest(409, 'The tentative usage session was cancelled')],
  ['an invalid value', nest(400, ['projectId must be a positive number'])],
  ['an unexpected server error', nest(500, 'Internal server error')],
  ['a balance that does not cover a new session', nest(400, 'INSUFFICIENT_BALANCE')],
] as const;

describe.each(['en', 'de'] as const)('project switch errors in %s', (language) => {
  beforeEach(() => {
    state.apiError.mockReset();
    useTranslationState.setState({ language });
  });

  it.each(cases)('says that the project was not changed after %s', async (_name, error) => {
    renderHook(() => useSwitchSessionProject(7, vi.fn()));

    await state.onError?.(error);

    expect(lastToast().description).toMatch(NOT_CHANGED[language]);
    expect(lastToast().title).not.toMatch(/^Server/);
  });

  it.each([
    ['the connection broke', new TypeError('Failed to fetch')],
    ['a proxy gave up', Object.assign(new Error('Bad Gateway'), { status: 502, body: '<html></html>' })],
    ['a proxy timed out', Object.assign(new Error('Gateway Timeout'), { status: 504, body: '' })],
  ])('does not claim an outcome when %s', async (_name, error) => {
    renderHook(() => useSwitchSessionProject(7, vi.fn()));

    await state.onError?.(error);

    expect(lastToast().description).not.toMatch(NOT_CHANGED[language]);
    expect(lastToast().title).toMatch(language === 'en' ? /not confirmed/ : /nicht bestätigt/);
  });

  it('knows nothing was changed when the forms could not even be loaded', () => {
    const { result } = renderHook(() => useSwitchSessionProject(7, vi.fn()));

    result.current.reportError(new TypeError('Failed to fetch'));

    expect(lastToast().description).toMatch(NOT_CHANGED[language]);
  });
});

describe.each([
  ['en', /Technical details: /],
  ['de', /Technische Details: /],
] as const)('untranslated server text in %s', (language, label) => {
  beforeEach(() => {
    state.apiError.mockReset();
    useTranslationState.setState({ language });
  });

  it.each([
    ['a meter that cannot be read', nest(400, 'METER_SWITCH_FAILED: "Energy": The cumulative counter decreased')],
    ['an unmapped refusal', nest(400, ['projectId must be a positive number'])],
  ])('is labelled as technical detail after %s', async (_name, error) => {
    renderHook(() => useSwitchSessionProject(7, vi.fn()));

    await state.onError?.(error);

    expect(lastToast().description).toMatch(label);
  });

  it('is labelled as technical detail when the forms could not be loaded', () => {
    const { result } = renderHook(() => useSwitchSessionProject(7, vi.fn()));

    result.current.reportError(new TypeError('Failed to fetch'));

    expect(lastToast().description).toMatch(label);
  });
});

describe('project switch error details', () => {
  beforeEach(() => {
    state.apiError.mockReset();
    useTranslationState.setState({ language: 'de' });
  });

  it('keeps the message an administrator wrote into a flow', async () => {
    renderHook(() => useSwitchSessionProject(7, vi.fn()));

    await state.onError?.(nest(422, 'FLOW_EXECUTION_ERROR: Door is open'));

    expect(lastToast().description).toContain('Door is open');
    expect(lastToast().description).not.toContain('FLOW_EXECUTION_ERROR');
  });

  it('leaves a refusal that is already translated as it is', async () => {
    renderHook(() => useSwitchSessionProject(7, vi.fn()));

    await state.onError?.(nest(400, 'INSUFFICIENT_BALANCE'));

    expect(lastToast().title).toBe('Nicht genügend Guthaben');
  });
});
