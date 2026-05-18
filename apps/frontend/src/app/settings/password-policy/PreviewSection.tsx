import { useCallback, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader, Chip, Input } from '@heroui/react';
import { CheckIcon, XIcon } from 'lucide-react';
import { COMMON_PASSWORDS, PolicyError, validatePassword } from '@attraccess/shared';
import { PasswordPolicyDto } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

const SAMPLES = ['password', 'Tr0ub4dor-9!plate', 'correcthorsebatterystaple', 'X9$qz!Tm-2k_Q!fL'];

function renderError(err: PolicyError, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const key = `preview.errors.${err.code}`;
  return t(key, err.params as Record<string, string | number>);
}

interface Props {
  policy: PasswordPolicyDto;
}

export function PreviewSection({ policy }: Props) {
  const { t } = useTranslations({ en, de });
  const [candidate, setCandidate] = useState('');

  const evaluate = useCallback(
    (pw: string) => validatePassword(pw, policy, {}, { commonPasswords: COMMON_PASSWORDS }),
    [policy],
  );

  const candidateResult = useMemo(() => evaluate(candidate), [candidate, evaluate]);
  const sampleResults = useMemo(() => SAMPLES.map((s) => ({ sample: s, result: evaluate(s) })), [evaluate]);

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-1">
        <span className="text-base font-semibold">{t('preview.title')}</span>
        <span className="text-sm text-default-500">{t('preview.subtitle')}</span>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Input
          label={t('preview.passwordLabel')}
          value={candidate}
          onValueChange={setCandidate}
          variant="bordered"
          type="text"
          data-testid="policy-preview-input"
        />
        {candidate.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="policy-preview-result">
            <Chip
              color={candidateResult.ok ? 'success' : 'danger'}
              startContent={candidateResult.ok ? <CheckIcon size={14} /> : <XIcon size={14} />}
              variant="flat"
            >
              {candidateResult.ok ? t('preview.pass') : t('preview.fail')}
            </Chip>
            {candidateResult.errors.length === 0 ? (
              <span className="text-xs text-default-500">{t('preview.noErrors')}</span>
            ) : (
              <ul className="list-disc pl-5 text-xs text-default-600">
                {candidateResult.errors.map((err, idx) => (
                  <li key={idx}>{renderError(err, t)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('preview.samples')}</span>
          <ul className="flex flex-col gap-1">
            {sampleResults.map(({ sample, result }) => (
              <li key={sample} className="flex items-center justify-between gap-2 text-xs">
                <code className="rounded bg-default-100 px-2 py-0.5">{sample}</code>
                <Chip
                  size="sm"
                  color={result.ok ? 'success' : 'danger'}
                  variant="flat"
                  startContent={result.ok ? <CheckIcon size={12} /> : <XIcon size={12} />}
                >
                  {result.ok ? t('preview.pass') : t('preview.fail')}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
