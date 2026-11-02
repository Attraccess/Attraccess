/* eslint-disable @typescript-eslint/no-explicit-any */
import { CardSessionService } from '../../attractap/websockets/handlers/ui/card-session.service';
import { UiAuditService } from '../../attractap/websockets/handlers/ui/ui-audit.service';
import { UiStepService } from '../../attractap/websockets/handlers/ui/ui-step.service';
import { ReaderStartGate } from '../../attractap/websockets/handlers/session/reader-start-gate.service';
import { ReaderUiAlertsService } from '../../plugin-system/reader-ui/reader-ui-alerts.service';
import { ReaderUiHooksService } from '../../plugin-system/reader-ui/reader-ui-hooks.service';
import { ReaderUiSettingsService } from '../../plugin-system/reader-ui/reader-ui-settings.service';
import { WebStartStepStore } from '../../resources/usage/pre-start/web-start-step.store';
import type { AttractapAuditEvent } from './domain-events';
import { ATTRACTAP_AUDIT_ACTIONS, projectAttractapAuditEvent } from './attractap';

/** A scoped npm name: the strictest plugin name every validator must accept. */
const PLUGIN = '@scope/reservations';

/**
 * Drives the real services that write `attractap.ui.*` entries and runs every entry through the real
 * projection: an entry whose details do not fit its allowlist would otherwise be dropped silently.
 */
function capture() {
  const events: AttractapAuditEvent[] = [];
  const audit = { recordAttractap: jest.fn(async (event: AttractapAuditEvent) => void events.push(event)) };
  return { events, audit };
}

function socket(): any {
  return { id: 's', readerId: 5, state: { lastAuthenticatedUserId: 7 }, sendMessage: jest.fn().mockResolvedValue(true) };
}

const confirmation = { stepKey: 'res-conflict', title: 'Reserved from 14:00', body: 'Start anyway?' };
const binding = { resourceId: 12, action: 'start' as const, userId: 7 };

async function readerStepEvents(audit: any) {
  const cards = new CardSessionService();
  const steps = new UiStepService(cards, new UiAuditService(audit));
  (steps as any).formsHandler = { clearFormDraft: jest.fn() };
  const issue = (s: any, cardConfirm = false) =>
    steps.issueStart(s, { ...binding, plugin: PLUGIN, confirmation, requestId: 1, cardConfirm, satisfied: {} });

  const answered = socket();
  cards.issue(answered, 7, 'en');
  steps.consumeStart(answered, issue(answered)?.stepId, binding); // issued + answered

  const expired = socket();
  cards.issue(expired, 7, 'en');
  const late = issue(expired);
  jest.setSystemTime(Date.now() + 70_000);
  steps.consumeStart(expired, late?.stepId, binding); // expired

  const cancelled = socket();
  cards.issue(cancelled, 7, 'en');
  steps.handleResult(cancelled, { stepId: issue(cancelled)?.stepId, action: 'cancel' }); // cancelled

  const otherTap = socket();
  cards.issue(otherTap, 7, 'en');
  issue(otherTap, true);
  cards.issue(otherTap, 8, 'en'); // another user's tap: card_confirm_cancelled

  const question = socket();
  cards.issue(question, 7, 'en');
  const choice = {
    stepKey: 'free-rest',
    title: 'Free the rest?',
    body: 'Release your booking',
    choices: [{ id: 'keep', label: 'Keep' }],
    defaultOnTimeout: 'keep',
    onAnswer: jest.fn(),
  };
  steps.offerPostStop(question, { plugin: PLUGIN, choice, userId: 7, resourceId: 12 });
  const [step] = [...question.state.uiSteps.values()];
  steps.handleResult(question, { stepId: step.stepId, action: 'keep' });
  return { cards, steps };
}

async function gateEvents(audit: any) {
  const cards = new CardSessionService();
  const uiAudit = new UiAuditService(audit);
  const steps = new UiStepService(cards, uiAudit);
  const make = (override: string | null) =>
    new ReaderStartGate(
      {
        hasHooks: () => true,
        evaluate: jest.fn().mockResolvedValue({ decision: 'confirm', plugin: PLUGIN, confirmation }),
      } as never,
      {} as never,
      steps,
      cards,
      { noScreenPolicyOverride: jest.fn().mockResolvedValue(override) } as never,
      { isReaderSuspended: () => false } as never,
      { findReaderById: jest.fn() } as never,
      uiAudit,
    );
  const lite = socket();
  lite.state.uiSlots = { capabilities: { schemaVersion: 1, steps: [] } };
  cards.issue(lite, 7, 'en');
  await make('allow-with-warning').run(lite, { user: { id: 7 } as any, resourceId: 12 }); // no_screen_policy_applied
  const touch = socket();
  touch.state.uiSlots = { capabilities: { schemaVersion: 1, steps: ['confirm'] } };
  await make(null).run(touch, { user: { id: 7 } as any, resourceId: 12 }); // CONFIRMATION_UNAVAILABLE
}

async function hookEvents(audit: any) {
  let failing = true;
  const make = (policy: string) =>
    new ReaderUiHooksService(
      {
        preStartHooks: () => [
          {
            plugin: PLUGIN,
            hook: () => {
              if (failing) throw new Error('down');
              return { decision: 'block', reason: { code: 'RESERVED', title: 'Reserved', body: 'Booked' } };
            },
          },
        ],
        sessionEndHooks: () => [],
      } as never,
      { failurePolicy: jest.fn().mockResolvedValue(policy) } as never,
      {
        onCleared: jest.fn(),
        raise: jest.fn().mockResolvedValue({}),
        clearWhere: jest.fn().mockResolvedValue(undefined),
      } as never,
      audit,
      { get: () => ({ READER_UI_BREAKER_THRESHOLD: 1 }) } as never,
    );
  const run = { resourceId: 12, userId: 7, action: 'start' as const, origin: 'reader' as const, language: 'en' as const };
  const reader = { ...run, readerId: 5, cardSessionId: 'AbCdEfGhIjKlMnOp', satisfied: new Map() };
  const service = make('fail-open');
  await service.runPreStart(reader); // fail_open_used + breaker_changed(open)
  failing = false;
  jest.setSystemTime(Date.now() + 61_000);
  await service.runPreStart({ ...run, origin: 'web', satisfied: new Map() }); // breaker_changed(closed) + hook_decision
}

async function adminEvents(audit: any) {
  const rows: any[] = [];
  const repository = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async ({ where }: any) => rows.find((row) => row.id === where.id && !row.clearedAt) ?? null),
    create: (x: any) => ({ clearedAt: null, clearedByUserId: null, plugin: null, readerId: null, ...x }),
    save: jest.fn(async (x: any) => {
      if (!x.id) rows.push(Object.assign(x, { id: rows.length + 1 }));
      return x;
    }),
  };
  const alerts = new ReaderUiAlertsService(repository as never, audit, { readerUiOpenAlerts: { set: jest.fn() } } as never);
  repository.findOne.mockResolvedValueOnce(null);
  const alert = await alerts.raise('breaker-open', 'Hooks keep failing', { plugin: PLUGIN });
  await alerts.clear(alert.id, { id: 9, authenticationMethod: 'api-token', apiTokenId: 4 });

  const store = () => ({ findOne: jest.fn(async () => null), find: jest.fn(async () => []), save: jest.fn() });
  const settings = new ReaderUiSettingsService(store() as never, store() as never, store() as never, audit, {
    pluginNames: () => [PLUGIN],
  } as never);
  await settings.setResource(
    12,
    { noScreenPolicy: 'card-confirm', plugins: [{ plugin: PLUGIN, widgetsEnabled: false, hookFailurePolicy: 'fail-open' }] },
    { id: 9 },
  );
  await settings.setReader(5, false, { id: 9, authenticationMethod: 'session' });

  const web = new WebStartStepStore(audit);
  const id = web.issue({ userId: 7, resourceId: 12, action: 'start', origin: 'api', apiTokenId: 4 }, PLUGIN, 'k', 60, {});
  web.consume([id.stepId], { userId: 7, resourceId: 12, action: 'start', origin: 'api', apiTokenId: 4 });
}

describe('attractap.ui.* audit entries written by the real services', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('all pass the real projection, and every ui action is covered', async () => {
    const { events, audit } = capture();
    await readerStepEvents(audit);
    await gateEvents(audit);
    await hookEvents(audit);
    await adminEvents(audit);
    await jest.advanceTimersByTimeAsync(0);

    const dropped = events.filter((event) => projectAttractapAuditEvent(event) === null);
    expect(dropped).toEqual([]);
    const uiActions = ATTRACTAP_AUDIT_ACTIONS.filter((action) => action.startsWith('attractap.ui.')).map((action) =>
      action.replace('attractap.', ''),
    );
    expect(new Set(events.map((event) => event.action))).toEqual(new Set(uiActions));
  });

  it('records who tapped when another user cancels a card-confirm', async () => {
    const { events, audit } = capture();
    await readerStepEvents(audit);
    const cancelled = events.find((event) => event.action === 'ui.card_confirm_cancelled');
    expect(cancelled?.details).toMatchObject({ userId: 7, tappedUserId: 8, origin: 'reader', plugin: PLUGIN });
  });
});
