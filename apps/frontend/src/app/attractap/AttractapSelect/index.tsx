import {
  AttractapCapabilities,
  useAttractapServiceGetCardWriterSettings,
  useAttractapServiceGetReaders,
} from '@attraccess/react-query-client';
import { Alert } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../../components/select';
import { cardWritingBlocker } from '../cardWriting';
import de from './de.json';
import en from './en.json';

interface Props {
  selection: number | null | undefined;
  onSelectionChange: (selection: number) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  requiredCapabilities?: Partial<AttractapCapabilities>;
  /** Only offer these readers (e.g. the ones linked to a resource). */
  readerIds?: number[];
  /**
   * Offer only readers that may enroll and reset cards: current firmware (card relay) and allowed by
   * the administrator's card enrollment setting. When none qualifies, say why.
   */
  forCardWriting?: boolean;
}

/** Why a card-writing picker offers no reader, from the most basic cause to the most specific. */
type EmptyReason = 'noConnectedReader' | 'firmwareUpdateRequired' | 'noCardEnrollment' | 'notAllowed';

export function AttractapSelect(props: Props) {
  const { t } = useTranslations({ en, de });
  const { data: readers, isLoading: readersLoading } = useAttractapServiceGetReaders();
  const { data: cardWriterSettings, isLoading: settingsLoading } = useAttractapServiceGetCardWriterSettings(undefined, {
    enabled: !!props.forCardWriting,
  });
  // Listing every reader before the setting arrives would offer readers the server then refuses.
  const isLoading = !!props.forCardWriting && (readersLoading || settingsLoading);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { offered, emptyReason } = useMemo(() => {
    // last connection within 30s
    const connected = (readers ?? [])
      .filter((r) => r.lastConnection && new Date(r.lastConnection).getTime() > now - 30000)
      .filter((r) => !props.readerIds || props.readerIds.includes(r.id));
    // Readers on firmware before 2.0.0 cannot take part, whatever the setting says.
    const capable = connected
      .filter((r) => !props.forCardWriting || cardWritingBlocker(r) === null)
      .filter((r) => {
        if (!props.requiredCapabilities) {
          return true;
        }
        return Object.entries(props.requiredCapabilities).every(
          ([key, value]) => r.firmware.capabilities[key as keyof AttractapCapabilities] === value,
        );
      });
    // If the setting cannot be loaded the server still enforces it, so fall back to firmware only.
    const offered = capable.filter(
      (r) =>
        !props.forCardWriting ||
        !cardWriterSettings ||
        cardWriterSettings.mode === 'all' ||
        cardWriterSettings.readerIds.includes(r.id),
    );

    let emptyReason: EmptyReason | null = null;
    if (props.forCardWriting && offered.length === 0) {
      if (connected.length === 0) emptyReason = 'noConnectedReader';
      else if (capable.length > 0) emptyReason = 'notAllowed';
      else if (connected.some((r) => cardWritingBlocker(r) === 'firmwareUpdateRequired'))
        emptyReason = 'firmwareUpdateRequired';
      else emptyReason = 'noCardEnrollment';
    }
    return { offered, emptyReason };
  }, [readers, now, props.requiredCapabilities, props.readerIds, props.forCardWriting, cardWriterSettings]);

  return (
    <>
      <Select
        items={isLoading ? [] : offered.map((r) => ({ key: r.id.toString(), label: r.name }))}
        label={props.label}
        aria-label={props.ariaLabel}
        placeholder={
          isLoading ? t('loading') : (readers?.find((r) => r.id === props.selection)?.name ?? props.placeholder)
        }
        value={props.selection ? props.selection.toString() : ''}
        onChange={(key) => props.onSelectionChange(Number(key))}
        isDisabled={isLoading || emptyReason !== null}
        data-cy="attractap-select"
      />
      {!isLoading && emptyReason ? (
        <Alert status="warning" data-testid="attractap-select-empty">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t(`empty.${emptyReason}.title`)}</Alert.Title>
            <Alert.Description>{t(`empty.${emptyReason}.description`)}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </>
  );
}
