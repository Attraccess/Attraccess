import { AttractapFirmware, useAttractapServiceGetFirmwares } from '@attraccess/react-query-client';
import { Card, Chip, ProgressCircle, ProgressCircleFillCircle, ProgressCircleTrack, ProgressCircleTrackCircle } from "@heroui/react";
import { PageHeader } from '../../../../components/pageHeader';

interface Props {
  onSelect: (firmware: AttractapFirmware) => void;
}

export function FirmwareSelector(props: Props) {
  const { data: firmwares, isLoading } = useAttractapServiceGetFirmwares();

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
      {firmwares?.map((firmware) => (
        <Card onClick={() => props.onSelect(firmware)} key={`${firmware.name}-${firmware.variant}`}>
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
        </Card>
      ))}
    </div>
  );
}
