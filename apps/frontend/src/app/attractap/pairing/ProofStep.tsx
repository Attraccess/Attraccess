import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PairingDto } from '@attraccess/react-query-client';
import { formatEnrollmentCode } from './enrollmentCode';
import { PairingFlow } from './usePairingFlow';
import de from './de.json';
import en from './en.json';
import { CodeField } from './CodeField';
import { PatternStep } from './PatternStep';

/** How the admin proves the reader: a colour pattern, the code they already entered, or a code typed here. */
export function ProofStep(props: Readonly<{ flow: PairingFlow; current: PairingDto; insecure: boolean }>) {
  const { flow, current } = props;
  const { t } = useTranslations({ de, en });
  if (flow.byPattern) return <PatternStep current={current} />;
  if (flow.resolvedByCode && !flow.codeRejected) {
    const code = flow.normalizedCode ? formatEnrollmentCode(flow.normalizedCode) : '';
    return <p data-cy="attractap-pairing-code-chosen">{t('dialog.codeFound', { code })}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-default-500">{t(flow.bleBridge ? 'dialog.typeBridgeCode' : 'dialog.typeCode')}</p>
      <CodeField flow={flow} insecure={props.insecure} />
    </div>
  );
}
