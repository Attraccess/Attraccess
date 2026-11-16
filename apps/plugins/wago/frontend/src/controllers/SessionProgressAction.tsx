import { Button } from '@heroui/react';
import type { CommissioningSession } from '../api/client';
import { useCommissioningVerification } from '../commissioning/status/useCommissioningVerification';
import { useWagoTranslations } from '../i18n';

/** Hides "View progress" once commissioning evidence is verified; a stuck backend state should not read as still in progress. */
export function SessionProgressAction({
  session,
  onResume,
}: {
  session: CommissioningSession;
  onResume: (session: CommissioningSession) => void;
}) {
  const { t } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  if (verification.enrollmentComplete) return null;
  return (
    <Button size="sm" variant="secondary" onPress={() => onResume(session)}>
      {t('controllers.progress')}
    </Button>
  );
}
