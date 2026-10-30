import { Chip } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

const COLOUR = { unpaired: 'default', paired: 'success', revoked: 'danger', waiting: 'warning' } as const;

interface Props {
  state: 'unpaired' | 'paired' | 'revoked';
  /** A pairing for this reader is running; it shows instead of the stored state until it ends. */
  waiting?: boolean;
}

export function PairingStateChip(props: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  const shown = props.waiting ? 'waiting' : props.state;
  return (
    <Chip color={COLOUR[shown]} className="whitespace-nowrap" data-cy={`attractap-pairing-state-${shown}`}>
      {t(`state.${shown}`)}
    </Chip>
  );
}
