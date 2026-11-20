import { useMatterTranslations } from '../i18n';

/**
 * Where the device or endpoint is used in flows. No Matter flow nodes exist yet (ATT-1006, ATT-1010), so there is
 * nothing to look up: this is the neutral placeholder those tickets replace with the real usage list.
 */
export function FlowUsage() {
  const { t } = useMatterTranslations();
  return (
    <p className="mt:text-sm mt:text-muted" data-cy="matter-flow-usage">
      {t('devices.flowUsage.none')}
    </p>
  );
}
