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
        <Card key={`${firmware.name}-${firmware.variant}`}>
          <button
            type="button"
            className="w-full cursor-pointer text-left transition-colors hover:bg-default-100 active:bg-default-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => props.onSelect(firmware)}
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
      ))}
    </div>
  );
}
