import { Button, ButtonProps } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import 'esp-web-tools';
import de from './FabreaderFlashButton.de.json';
import en from './FabreaderFlashButton.en.json';
import React from 'react';
import { Firmware } from '../types';

// Add declaration for the custom element
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'esp-web-install-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          manifest: string;
        },
        HTMLElement
      >;
    }
  }
}

interface Props extends Omit<ButtonProps, 'slot' | 'onPress' | 'children'> {
  firmware: Firmware;
}

export function FabreaderFlashButton(props: Props) {
  const { t } = useTranslations('fabreader-flash-button', {
    de,
    en,
  });

  return (
    <esp-web-install-button manifest={props.firmware.manifest_path}>
      <Button {...props} slot="activate">
        {t('button.flash')}
      </Button>
      <Button {...props} isDisabled color="danger" slot="unsupported">
        {t('errors.unsupported')}
      </Button>
      <Button {...props} isDisabled color="danger" slot="not-allowed">
        {t('errors.notAllowed')}
      </Button>
    </esp-web-install-button>
  );
}
