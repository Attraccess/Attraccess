import { InputGroup, Label, TextField, Tooltip, TooltipContent } from '@heroui/react';
import { ClipboardCopyIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCopyToClipboard } from './useCopyToClipboard';
import en from './en.json';
import de from './de.json';

export function MonitoringEndpointAside() {
  const { t } = useTranslations({ en, de });
  const copyToClipboard = useCopyToClipboard();
  const metricsEndpointUrl = useMemo(() => `${window.location.origin}/api/metrics`, []);
  const prometheusSnippet = useMemo(
    () => `scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['${window.location.host}']
    bearer_token: '<YOUR_API_KEY>'`,
    [],
  );

  return (
    <>
      <TextField value={metricsEndpointUrl} isReadOnly>
        <Label>{t('endpointLabel')}</Label>
        <InputGroup>
          <InputGroup.Input className="font-mono text-sm" />
          <InputGroup.Suffix>
            <Tooltip>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={t('copyButton')}
                onPress={() =>
                  copyToClipboard(metricsEndpointUrl, t('endpointCopied.title'), t('endpointCopied.description'))
                }
              >
                <ClipboardCopyIcon size={16} />
              </Button>
              <TooltipContent>{t('copyButton')}</TooltipContent>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('setupGuide.title')}</h3>
        <p className="text-xs text-muted">{t('setupGuide.description')}</p>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-surface p-3 font-mono text-xs leading-relaxed">
          {prometheusSnippet}
        </pre>
        <p className="text-xs text-muted">{t('setupGuide.bearerNote')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('setupGuide.grafanaTitle')}</h3>
        <p className="text-xs text-muted">{t('setupGuide.grafanaDescription')}</p>
      </div>
    </>
  );
}
