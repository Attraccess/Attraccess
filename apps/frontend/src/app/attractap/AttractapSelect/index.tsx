import { AttractapCapabilities, useAttractapServiceGetReaders } from '@attraccess/react-query-client';
import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../../components/select';

interface Props {
  selection: number | null | undefined;
  onSelectionChange: (selection: number) => void;
  label?: string;
  placeholder?: string;
  requiredCapabilities?: Partial<AttractapCapabilities>;
}

export function AttractapSelect(props: Props) {
  const { data: readers, isLoading } = useAttractapServiceGetReaders();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const connectedReaders = useMemo(() => {
    // last connection within 30s
    return readers
      ?.filter((r) => r.lastConnection && new Date(r.lastConnection).getTime() > now - 30000)
      .filter((r) => {
        if (!props.requiredCapabilities) {
          return true;
        }
        return Object.entries(props.requiredCapabilities).every(
          ([key, value]) => r.firmware.capabilities[key as keyof AttractapCapabilities] === value,
        );
      });
  }, [readers, now]);

  return (
    <Select
      items={(connectedReaders ?? []).map((r) => ({ key: r.id.toString(), label: r.name }))}
      label={props.label}
      placeholder={readers?.find((r) => r.id === props.selection)?.name ?? props.placeholder}
      selectedKey={props.selection ? props.selection.toString() : ''}
      onSelectionChange={(key) => props.onSelectionChange(Number(key))}
      data-cy="attractap-select"
      isLoading={isLoading}
    />
  );
}
