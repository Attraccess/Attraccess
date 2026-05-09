import { AttractapFirmware, useAttractapServiceGetFirmwares } from '@attraccess/react-query-client';
import { Card, CardContent, CardHeader, Chip, ProgressCircle, ProgressCircleFillCircle, ProgressCircleTrack, ProgressCircleTrackCircle } from "@heroui/react";
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
        <Card onPress={() => props.onSelect(firmware)} isPressable key={`${firmware.name}-${firmware.variant}`}>
          <CardHeader>
            <PageHeader title={firmware.friendlyName} noMargin />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 flex-row">
            {firmware.variantFriendlyName.split(',').map((variantFeature) => (
              <Chip color="primary" key={`${firmware.name}-${firmware.variant}-${variantFeature}`}>
                {variantFeature}
              </Chip>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
