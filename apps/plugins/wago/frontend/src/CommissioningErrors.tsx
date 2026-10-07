import { ErrorAlert } from './CommissioningModal.error-alert';
import { CommissioningModel } from './CommissioningModal';

export function CommissioningErrors({ model }: { model: CommissioningModel }) {
  const {
    createSessionMutation,
    confirmHostKeyMutation,
    deliverSessionMutation,
    removeSessionMutation,
    recoverSessionMutation,
  } = model;
  return (
    <>
      {createSessionMutation.isError && <ErrorAlert error={createSessionMutation.error} />}
      {confirmHostKeyMutation.isError && <ErrorAlert error={confirmHostKeyMutation.error} />}
      {deliverSessionMutation.isError && <ErrorAlert error={deliverSessionMutation.error} />}
      {removeSessionMutation.isError && <ErrorAlert error={removeSessionMutation.error} />}
      {recoverSessionMutation.isError && <ErrorAlert error={recoverSessionMutation.error} />}
    </>
  );
}
