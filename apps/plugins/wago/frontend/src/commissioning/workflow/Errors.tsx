import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from '../../i18n';
import { CommissioningModel } from '../CommissioningModal';

export function CommissioningErrors({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const mutations = [
    model.createSessionMutation,
    model.confirmHostKeyMutation,
    model.deliverSessionMutation,
    model.removeSessionMutation,
    model.recoverSessionMutation,
  ];
  return (
    <>
      {mutations.map(
        (mutation, slot) =>
          mutation.isError && (
            // The list is fixed, so the slot identifies the mutation.
            <StatusAlert key={slot} status="danger">
              {mutation.error instanceof Error ? mutation.error.message : t('common.retry')}
            </StatusAlert>
          ),
      )}
    </>
  );
}
