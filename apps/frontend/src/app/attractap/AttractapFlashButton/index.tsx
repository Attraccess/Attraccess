import { Button, ButtonProps } from '@heroui/react';
// import { useTranslations } from '@attraccess/plugins-frontend-ui';
import 'esp-web-tools';
// import de from './de.json';
// import en from './en.json';
import React from 'react';
import { AttractapFirmware } from '@attraccess/react-query-client';

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
  firmware: AttractapFirmware;
}

export function AttractapFlashButton(props: Readonly<Props>) {
  /*const { t } = useTranslations('attractap-flash-button', {
    de,
    en,
  });*/

  return <Button isDisabled>ESP Flasher WIP</Button>;

  /*
  return (
    <esp-web-install-button manifest={props.firmware.manifest_path} data-cy="attractap-flash-esp-web-install-button">
      <Button {...props} slot="activate" data-cy="attractap-flash-activate-button">
        {t('button.flash')}
      </Button>
      <Button {...props} isDisabled color="danger" slot="unsupported" data-cy="attractap-flash-unsupported-button">
        {t('errors.unsupported')}
      </Button>
      <Button {...props} isDisabled color="danger" slot="not-allowed" data-cy="attractap-flash-not-allowed-button">
        {t('errors.notAllowed')}
      </Button>
    </esp-web-install-button>
  );*/
}
