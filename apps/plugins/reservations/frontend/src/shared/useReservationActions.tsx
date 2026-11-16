import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Label, TextArea, TextField } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { reservationAction, type ReservationAction } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useInvalidateReservations } from '../lib/queries';
import type { Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';

interface Pending {
  action: ReservationAction;
  reservation: Reservation;
}

const WITH_REASON = new Set<ReservationAction>(['approve', 'reject']);

/**
 * Confirmation flow for every state-changing reservation action. Nothing is sent before the
 * user confirms in a StatusDialog; failures show a localised error dialog.
 */
export function useReservationActions(options: { timezone?: string | null; onDone?: () => void } = {}) {
  const { t } = useReservationsTranslations();
  const format = useFormatters(options.timezone);
  const invalidate = useInvalidateReservations();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ action, reservation }: Pending) => reservationAction(reservation.id, action, reason.trim()),
    onSuccess: async () => {
      setPending(null);
      setReason('');
      await invalidate();
      options.onDone?.();
    },
    onError: (failure) => {
      setPending(null);
      setError(describeError(failure, t));
      void invalidate();
    },
  });

  const ask = (action: ReservationAction, reservation: Reservation) => {
    setReason('');
    setPending({ action, reservation });
  };

  const close = () => {
    if (!mutation.isPending) setPending(null);
  };

  // Managers acting on somebody else's booking, and every approval decision, may explain themselves.
  const reasonAllowed = (current: Pending) =>
    WITH_REASON.has(current.action) || (current.action === 'cancel' && !current.reservation.mine);

  const status = pending?.action === 'keep' || pending?.action === 'approve' ? 'info' : 'warning';

  const dialogs: ReactNode = (
    <>
      <StatusDialog
        isOpen={pending !== null}
        onClose={close}
        status={status}
        title={pending ? t(`actions.${pending.action}.title`) : ''}
        action={{
          label: pending ? t(`actions.${pending.action}.confirm`) : '',
          onPress: () => pending && mutation.mutate(pending),
          isPending: mutation.isPending,
        }}
        closeLabel={t('common.back')}
        data-cy="reservations-action-dialog"
      >
        {pending && (
          <div className="rv:flex rv:flex-col rv:gap-3">
            <p>
              {t(`actions.${pending.action}.body`, {
                resource: pending.reservation.resourceName ?? '',
                range: format.range(pending.reservation.startTime, pending.reservation.endTime),
                until: format.time(pending.reservation.endTime),
              })}
            </p>
            {reasonAllowed(pending) && (
              <TextField value={reason} onChange={setReason}>
                {/* Mails show an approval's text as a comment; everything else is a reason. */}
                <Label>{t(pending.action === 'approve' ? 'actions.commentLabel' : 'actions.reasonLabel')}</Label>
                <TextArea maxLength={500} rows={2} />
              </TextField>
            )}
          </div>
        )}
      </StatusDialog>
      <StatusDialog
        isOpen={error !== null}
        onClose={() => setError(null)}
        status="error"
        title={t('actions.failedTitle')}
        data-cy="reservations-action-error"
      >
        {error ?? ''}
      </StatusDialog>
    </>
  );

  return { ask, dialogs, isPending: mutation.isPending };
}
