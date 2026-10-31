import { Chip } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ReactNode } from 'react';
import de from './de.json';
import en from './en.json';

export type ReaderKind = 'touch' | 'lite';

/** The reader type from its firmware, so token readers and waiting devices are labelled the same way. */
export function readerKindOf(firmware: { name?: string } | null | undefined): ReaderKind {
  return firmware?.name?.includes('lite') ? 'lite' : 'touch';
}

/** One reader that needs pairing: its type, its name, one line of context and one action. */
export function PairingRow(props: Readonly<{ kind: ReaderKind; name: string; detail: string; action: ReactNode }>) {
  const { t } = useTranslations({ de, en });
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Chip>{t(`kind.${props.kind}`)}</Chip>
          <span>{props.name}</span>
        </div>
        <span className="text-xs text-default-500">{props.detail}</span>
      </div>
      {props.action}
    </div>
  );
}
