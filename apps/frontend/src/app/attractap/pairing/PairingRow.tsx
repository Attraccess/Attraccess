import { Chip } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ReactNode } from 'react';
import de from './de.json';
import en from './en.json';

export type ReaderKind = 'touch' | 'lite';
/** What a pairing row calls the reader: its pairing kind, except that a BLE Bridge (a `lite` reader) is named. */
export type ReaderType = ReaderKind | 'bridge';

/**
 * The reader type from its firmware, so reader records and waiting devices are labelled the same way. A waiting
 * device passes the pairing kind it announced; a reader that has not reported firmware falls back to it.
 */
export function readerTypeOf(firmware: { name?: string | null } | null | undefined, kind?: ReaderKind): ReaderType {
  if (firmware?.name === 'attractap_bridge') return 'bridge';
  if (kind) return kind;
  return firmware?.name?.includes('lite') ? 'lite' : 'touch';
}

/** One reader that needs pairing: its type, its name, one or two lines of context and one action. */
export function PairingRow(
  props: Readonly<{
    kind: ReaderType;
    name: string;
    detail: string;
    note?: string;
    noteCy?: string;
    action: ReactNode;
  }>,
) {
  const { t } = useTranslations({ de, en });
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Chip>{t(`kind.${props.kind}`)}</Chip>
          <span>{props.name}</span>
        </div>
        <span className="text-xs text-default-500">{props.detail}</span>
        {props.note && (
          <span className="text-xs text-default-500" data-cy={props.noteCy}>
            {props.note}
          </span>
        )}
      </div>
      {props.action}
    </div>
  );
}
