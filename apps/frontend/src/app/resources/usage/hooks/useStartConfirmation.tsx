import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@attraccess/react-query-client';
import { StatusDialog, useTranslations, type StatusDialogStatus } from '@attraccess/plugins-frontend-ui';

export const CONFIRMATION_REQUIRED_CODE = 'CONFIRMATION_REQUIRED';
export const START_BLOCKED_CODE = 'START_BLOCKED';

export interface StartConfirmation {
  title: string;
  body: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
  countdownToMs?: number;
  expiresAtMs?: number;
}

interface ConfirmationRequiredBody {
  code: typeof CONFIRMATION_REQUIRED_CODE;
  stepId: string;
  confirmation: StartConfirmation;
}

export interface StartBlockedReason {
  code: string;
  title: string;
  body: string;
}

const TONE_STATUS: Record<NonNullable<StartConfirmation['tone']>, StatusDialogStatus> = {
  primary: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
};

const en = { start: 'Start', remaining: 'Time remaining: {{time}}' };
const de = { start: 'Starten', remaining: 'Verbleibende Zeit: {{time}}' };

function errorBody(error: unknown): { status?: number; body?: Record<string, unknown> } {
  if (!(error instanceof ApiError)) return {};
  const body = error.body;
  return { status: error.status, body: typeof body === 'object' && body !== null ? (body as never) : undefined };
}

/** Recognised by `code`, never by message text. */
export function getConfirmationRequired(error: unknown): ConfirmationRequiredBody | null {
  const { status, body } = errorBody(error);
  if (status !== 409 || body?.['code'] !== CONFIRMATION_REQUIRED_CODE) return null;
  const confirmation = body['confirmation'] as StartConfirmation | undefined;
  if (typeof body['stepId'] !== 'string' || !confirmation?.title) return null;
  return body as unknown as ConfirmationRequiredBody;
}

export function getStartBlockedReason(error: unknown): StartBlockedReason | null {
  const { status, body } = errorBody(error);
  if (status !== 403 || body?.['code'] !== START_BLOCKED_CODE) return null;
  const reason = body['reason'] as StartBlockedReason | undefined;
  return reason?.title ? reason : null;
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

interface Pending<TBody> {
  confirmation: StartConfirmation;
  stepIds: string[];
  requestBody: TBody;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * Handles the typed 409 CONFIRMATION_REQUIRED of a session start: shows the plugin's confirmation, and on
 * confirm calls `retry` with the collected `confirmedStepIds`. Several plugins chain: every new 409 of the
 * same attempt keeps the step ids confirmed so far.
 */
export function useStartConfirmation<TBody extends { confirmedStepIds?: Array<string> }>(
  retry: (requestBody: TBody) => void,
) {
  const { t } = useTranslations({ en, de });
  const [pending, setPending] = useState<Pending<TBody> | null>(null);
  const now = useNow(pending !== null);

  const close = useCallback(() => setPending(null), []);

  /** Returns true when the error was a confirmation request (the caller must not show an error). */
  const handleStartError = useCallback((error: unknown, requestBody: TBody): boolean => {
    const required = getConfirmationRequired(error);
    if (!required) return false;
    setPending({
      confirmation: required.confirmation,
      stepIds: [...(requestBody.confirmedStepIds ?? []), required.stepId],
      requestBody,
    });
    return true;
  }, []);

  const confirm = useCallback(() => {
    if (!pending) return;
    setPending(null);
    retry({ ...pending.requestBody, confirmedStepIds: pending.stepIds });
  }, [pending, retry]);

  const expired = pending?.confirmation.expiresAtMs !== undefined && now >= pending.confirmation.expiresAtMs;
  useEffect(() => {
    if (expired) setPending(null);
  }, [expired]);

  const dialog: ReactNode = useMemo(() => {
    if (!pending) return null;
    const { confirmation } = pending;
    const remaining = confirmation.countdownToMs === undefined ? null : confirmation.countdownToMs - now;
    return (
      <StatusDialog
        isOpen
        onClose={close}
        status={TONE_STATUS[confirmation.tone ?? 'primary']}
        title={confirmation.title}
        closeLabel={confirmation.cancelLabel}
        action={{
          label: confirmation.confirmLabel ?? t('start'),
          onPress: confirm,
          'data-cy': 'start-confirmation-confirm',
        }}
        data-cy="start-confirmation"
      >
        <p>{confirmation.body}</p>
        {remaining !== null && remaining > 0 && (
          <p className="text-muted">{t('remaining', { time: formatRemaining(remaining) })}</p>
        )}
      </StatusDialog>
    );
  }, [pending, now, close, confirm, t]);

  return { handleStartError, dialog, isOpen: pending !== null };
}
