import { PageHeader } from '../../components/pageHeader';
import { ComputerIcon, PowerIcon, RefreshCcwIcon } from 'lucide-react';
import { Button, Card } from '@heroui/react';
import { BalenaIcon } from './balena-icon';
import { useSystemServiceRebootHost, useSystemServiceShutdownHost } from '@attraccess/react-query-client';
import { useCallback, useEffect, useState } from 'react';

export function BalenaPage() {
  const { mutate: shutdownHost } = useSystemServiceShutdownHost();
  const { mutate: rebootHost } = useSystemServiceRebootHost();

  const [shutdownIsConfirmed, setShutdownIsConfirmed] = useState(false);
  const [rebootIsConfirmed, setRebootIsConfirmed] = useState(false);

  useEffect(() => {
    if (!shutdownIsConfirmed) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setShutdownIsConfirmed(false);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [shutdownIsConfirmed, shutdownHost]);

  useEffect(() => {
    if (!rebootIsConfirmed) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setRebootIsConfirmed(false);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [rebootIsConfirmed, rebootHost]);

  const onClickReboot = useCallback(() => {
    if (!rebootIsConfirmed) {
      setRebootIsConfirmed(true);
      return;
    }

    rebootHost();
  }, [rebootIsConfirmed, rebootHost]);

  const onClickShutdown = useCallback(() => {
    if (!shutdownIsConfirmed) {
      setShutdownIsConfirmed(true);
      return;
    }

    shutdownHost();
  }, [shutdownIsConfirmed, shutdownHost]);

  return (
    <>
      <PageHeader title="Balena" icon={<BalenaIcon width={24} height={24} />} />

      <div className="flex flex-row flex-wrap gap-4">
        <Card className="w-full">
          <Card.Header>
            <PageHeader title="Host Machine" icon={<ComputerIcon />} />
          </Card.Header>
          <Card.Content className="flex flex-col gap-4">
            {/* TODO(heroui-v3): map dynamic color/variant to new variant prop */}
            <Button
             
              onPress={onClickReboot}
              variant={rebootIsConfirmed ? 'primary' : 'outline'}
            ><RefreshCcwIcon />
              {rebootIsConfirmed ? 'Confirm Reboot' : 'Reboot'}
            </Button>
            {/* TODO(heroui-v3): map dynamic color/variant to new variant prop */}
            <Button
             
              onPress={onClickShutdown}
              variant={shutdownIsConfirmed ? 'primary' : 'outline'}
            ><PowerIcon />
              {shutdownIsConfirmed ? 'Confirm Shutdown' : 'Shutdown'}
            </Button>
          </Card.Content>
        </Card>
      </div>
    </>
  );
}
