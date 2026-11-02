/* eslint-disable @typescript-eslint/no-explicit-any */
import { CardSessionService } from './card-session.service';
import { UiStepService } from './ui-step.service';

export function makeSocket(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'sock-1',
    readerId: 5,
    readyState: 1,
    sendMessage: jest.fn().mockResolvedValue(true),
    sendBinaryData: jest.fn(),
    state: { lastAuthenticatedUserId: 7 },
    ...overrides,
  };
}

export function makeStepServices() {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const forms = { clearFormDraft: jest.fn() };
  const cardSessions = new CardSessionService();
  const steps = new UiStepService(cardSessions, audit as never);
  (steps as any).formsHandler = forms;
  return { audit, forms, cardSessions, steps };
}

export const confirmation = (extra: Record<string, unknown> = {}) => ({
  stepKey: 'res-conflict',
  title: 'Reserved from 14:00',
  body: 'You have 40 min. Start anyway?',
  ...extra,
});

export const sentTypes = (socket: any): string[] =>
  socket.sendMessage.mock.calls.map((call: any[]) => call[0].data.type);

export const lastSent = (socket: any, type: string): any =>
  socket.sendMessage.mock.calls
    .map((call: any[]) => call[0].data)
    .filter((data: any) => data.type === type)
    .pop()?.payload;
