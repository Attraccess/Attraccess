import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { useNetworkRestriction } from '../../hooks/useNetworkRestriction';
import en from './translations/en.json';
import de from './translations/de.json';

interface NetworkRestrictedHintProps {
  /** The hint shows while the user may not do any of these actions from their current network. */
  actions: NetworkRestrictedAction | NetworkRestrictedAction[];
  className?: string;
}

/** The explanation next to a control that is disabled because the user is outside the allowed network. */
export function NetworkRestrictedHint({ actions, className }: Readonly<NetworkRestrictedHintProps>) {
  const { t } = useTranslations({ en, de });
  const { isRestricted } = useNetworkRestriction();
  const list = Array.isArray(actions) ? actions : [actions];
  if (!list.some(isRestricted)) return null;
  return (
    <p className={className ?? 'text-xs text-muted'} role="note" data-cy="network-restricted-hint">
      {t('onlyLocal')}
    </p>
  );
}
