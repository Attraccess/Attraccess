import { useMatterTranslations } from '../i18n';

/**
 * Where an endpoint is used in flows. Extension point for ATT-1006/ATT-1010: no Matter flow nodes exist yet, so there
 * is nothing to look up and this is a neutral placeholder. Those tickets look up the flows that bind `endpointRef`
 * (the endpoint's UUID) and replace the text with the usage list; the call site in `EndpointCard` stays as it is.
 */
export function FlowUsage({ endpointRef }: Readonly<{ endpointRef: string }>) {
  const { t } = useMatterTranslations();
  return (
    <p className="mt:text-sm mt:text-muted" data-cy="matter-flow-usage" data-endpoint-ref={endpointRef}>
      {t('devices.flowUsage.none')}
    </p>
  );
}
