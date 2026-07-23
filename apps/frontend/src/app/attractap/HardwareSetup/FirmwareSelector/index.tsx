import { AttractapFirmware, useAttractapServiceGetFirmwares } from '@attraccess/react-query-client';
import { Accordion, AccordionBody, AccordionHeading, AccordionItem, AccordionPanel, AccordionTrigger, Card, Chip, ProgressCircle, ProgressCircleFillCircle, ProgressCircleTrack, ProgressCircleTrackCircle } from "@heroui/react";
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';

import de from './de.json';
import en from './en.json';

interface Props {
  onSelect: (firmware: AttractapFirmware) => void;
}

function FirmwareCard({ firmware, onSelect }: { firmware: AttractapFirmware; onSelect: Props['onSelect'] }) {
  return (
    <Card>
      <button
        type="button"
        className="w-full cursor-pointer text-left transition-colors hover:bg-default-100 active:bg-default-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onSelect(firmware)}
      >
        <Card.Header>
          <PageHeader title={firmware.friendlyName} noMargin />
        </Card.Header>
        <Card.Content className="flex flex-wrap gap-2 flex-row">
          {firmware.variantFriendlyName.split(',').map((variantFeature) => (
            <Chip color="accent" key={`${firmware.name}-${firmware.variant}-${variantFeature}`}>
              {variantFeature}
            </Chip>
          ))}
        </Card.Content>
      </button>
    </Card>
  );
}

export function FirmwareSelector(props: Props) {
  const { data: firmwares, isLoading } = useAttractapServiceGetFirmwares();
  const { t } = useTranslations({ de, en });

  const standard = firmwares?.filter((firmware) => firmware.variant !== 'demo') ?? [];
  const demo = firmwares?.filter((firmware) => firmware.variant === 'demo') ?? [];

  return (
    <div className="flex flex-col gap-4">
      {isLoading && (
        <ProgressCircle isIndeterminate>
          <ProgressCircleTrack>
            <ProgressCircleTrackCircle />
            <ProgressCircleFillCircle />
          </ProgressCircleTrack>
        </ProgressCircle>
      )}
      {standard.map((firmware) => (
        <FirmwareCard key={`${firmware.name}-${firmware.variant}`} firmware={firmware} onSelect={props.onSelect} />
      ))}

      {demo.length > 0 && (
        <Accordion>
          <AccordionItem key="demo" id="demo">
            <AccordionHeading>
              <AccordionTrigger>{t('demo.title')}</AccordionTrigger>
            </AccordionHeading>
            <AccordionPanel>
              <AccordionBody className="flex flex-col gap-4">
                <p className="text-sm text-default-500">{t('demo.description')}</p>
                {demo.map((firmware) => (
                  <FirmwareCard key={`${firmware.name}-${firmware.variant}`} firmware={firmware} onSelect={props.onSelect} />
                ))}
              </AccordionBody>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
