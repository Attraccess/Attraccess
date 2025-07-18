import { AttractapFirmware, useAttractapServiceGetFirmwares } from '@attraccess/react-query-client';
import { Card, CardHeader } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';

interface Props {
  onSelect: (firmware: AttractapFirmware) => void;
}

export function FirmwareSelector(props: Props) {
  const { data: firmwares } = useAttractapServiceGetFirmwares();

  return (
    <div className="flex flex-col gap-4">
      {firmwares?.map((firmware) => (
        <Card onPress={() => props.onSelect(firmware)} isPressable>
          <CardHeader>
            <PageHeader title={firmware.friendlyName} subtitle={firmware.variantFriendlyName} noMargin />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
