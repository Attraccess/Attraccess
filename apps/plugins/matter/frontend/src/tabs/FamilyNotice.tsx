import { familyAvailability, type FeatureFamily } from '../capabilities';
import { useMatterTranslations } from '../i18n';
import { useMatterConnection } from '../MatterConnectionContext';

/**
 * Why a feature is not usable yet, worded from what the sidecar reports for its feature family: not reported or not
 * implemented, not known because the sidecar is not connected, or reported but not used by this plugin version yet.
 */
export function FamilyNotice({ family }: Readonly<{ family: FeatureFamily }>) {
  const { t } = useMatterTranslations();
  const { status } = useMatterConnection();
  const availability = familyAvailability(status, family);
  return <p data-cy={`matter-family-notice-${family}`}>{t(`notAvailable.${availability}`, { family })}</p>;
}
