import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PairingDialog } from './PairingDialog';
import { DEVICE_ENROLLMENT_PARAM } from './enrollmentCode';
import de from './de.json';
import en from './en.json';

/**
 * Opens the pairing dialog for `?enroll=CODE`, the link behind the QR code a touch reader shows. The
 * dialog looks the reader up by the code. Before sign-in nothing opens and the link stays in the address
 * bar, so it works right after signing in; a signed-in user without permission is told so.
 */
export function EnrollLinkDialog(props: Readonly<{ signedIn: boolean; canEnroll: boolean }>) {
  const { t } = useTranslations({ de, en });
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const linked = params.get(DEVICE_ENROLLMENT_PARAM);

  const dismiss = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(DEVICE_ENROLLMENT_PARAM);
        return next;
      },
      { replace: true },
    );

  if (!props.signedIn || linked === null) return null;
  if (!props.canEnroll) {
    return (
      <StatusDialog
        isOpen
        status="warning"
        title={t('enrollLink.noPermissionTitle')}
        onClose={dismiss}
        data-cy="attractap-enroll-link-no-permission"
      >
        {t('enrollLink.noPermission')}
      </StatusDialog>
    );
  }
  return (
    <PairingDialog
      isOpen
      presetCode={linked}
      onClose={dismiss}
      onPaired={(readerId) => {
        navigate(`/attractap/readers?editReader=${readerId}`, { replace: true });
      }}
    />
  );
}
