import { AttractapFirmware, useAttractapServiceGetFirmwares } from '@attraccess/react-query-client';
import { Card, CardBody, CardHeader, Chip, CircularProgress } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';

interface Props {
  onSelect: (firmware: AttractapFirmware) => void;
}

export function FirmwareSelector(props: Props) {
  const { data: firmwares, isLoading } = useAttractapServiceGetFirmwares();

  return (
    <div className="flex flex-col gap-4">
      {isLoading && <CircularProgress isIndeterminate />}
      {firmwares?.map((firmware) => (
        <Card onPress={() => props.onSelect(firmware)} isPressable key={`${firmware.name}-${firmware.variant}`}>
          <CardHeader>
            <PageHeader title={firmware.friendlyName} noMargin />
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2 flex-row">
            {firmware.variantFriendlyName.split(',').map((variantFeature) => (
              <Chip color="primary" key={`${firmware.name}-${firmware.variant}-${variantFeature}`}>
                {variantFeature}
              </Chip>
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
