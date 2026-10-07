import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  AlertContent,
  AlertTitle,
  Card,
  Chip,
  Spinner,
} from '@heroui/react';
import { DownloadIcon, MonitorIcon } from 'lucide-react';
import { Button } from '../../../components/button';
import { platformLabel } from './index.helpers';
import { SETUP_STEPS } from './index.setup-steps';
import { useCompanionSettingsPageState } from './useCompanionSettingsPageState';
type Props = Pick<
  ReturnType<typeof useCompanionSettingsPageState>,
  't' | 'manifest' | 'manifestLoading' | 'downloadUrl'
>;
export function CompanionSettingsPageDownloadTitle({ t, manifest, manifestLoading, downloadUrl }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Download */}
      <Card>
        <Card.Header className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold">{t('download.title')}</span>
            {manifest && !manifestLoading && (manifest.platforms?.length ?? 0) > 0 && (
              <Chip color="success" size="sm">
                {t('version.label', { version: manifest.version })}
              </Chip>
            )}
          </div>
          <span className="text-sm text-default-500">{t('download.subtitle')}</span>
        </Card.Header>
        <Card.Content>
          {(!manifest || (manifest.platforms?.length ?? 0) === 0) && !manifestLoading ? (
            <Alert color="default">
              <AlertContent>
                <AlertTitle>{t('download.noBinaries')}</AlertTitle>
              </AlertContent>
            </Alert>
          ) : manifestLoading ? (
            <Spinner size="sm" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {manifest?.platforms.map((entry) => (
                <Card key={`${entry.platform}-${entry.arch}`} className="border border-divider">
                  <Card.Content className="flex flex-col items-center gap-3 py-4">
                    <MonitorIcon size={28} className="text-default-400" />
                    <span className="text-sm font-medium text-center">{platformLabel(entry.platform, entry.arch)}</span>
                    <a href={downloadUrl(entry.platform, entry.arch)} download={entry.filename} className="w-full">
                      <Button variant="primary" size="sm" className="w-full">
                        <DownloadIcon className="w-4 h-4" />
                        {t('download.button')}
                      </Button>
                    </a>
                  </Card.Content>
                </Card>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <Card.Header className="flex flex-col items-start gap-1">
          <span className="text-base font-semibold">{t('setup.title')}</span>
          <span className="text-sm text-default-500">{t('setup.subtitle')}</span>
        </Card.Header>
        <Card.Content>
          <Accordion>
            {SETUP_STEPS.map((step, idx) => (
              <AccordionItem key={step} id={step} aria-label={t(`setup.steps.${step}.title`)}>
                <AccordionHeading>
                  <AccordionTrigger>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                        {idx + 1}
                      </span>
                      {t(`setup.steps.${step}.title`)}
                    </span>
                  </AccordionTrigger>
                </AccordionHeading>
                <AccordionPanel>
                  <AccordionBody>
                    <p className="text-sm text-default-600 ml-9">{t(`setup.steps.${step}.description`)}</p>
                  </AccordionBody>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Card.Content>
      </Card>
    </div>
  );
}
