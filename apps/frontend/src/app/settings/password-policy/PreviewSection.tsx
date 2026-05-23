import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Chip, Input, Label, Spinner, TextField } from '@heroui/react';
import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from 'lucide-react';
import type { PolicyError } from '@attraccess/shared';
import {
  PasswordPolicyAdminService,
  PasswordPolicyDto,
  PreviewPasswordResultDto,
  UpdatePasswordPolicyDto,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

const DEBOUNCE_MS = 400;

interface Props {
  policy: PasswordPolicyDto;
}

function toDraftPolicy(p: PasswordPolicyDto): UpdatePasswordPolicyDto {
  return {
    minLength: p.minLength,
    maxLength: p.maxLength,
    allowAllUnicode: p.allowAllUnicode,
    requireUppercase: p.requireUppercase,
    requireLowercase: p.requireLowercase,
    requireDigit: p.requireDigit,
    requireSpecial: p.requireSpecial,
    checkHIBP: p.checkHIBP,
    checkCommonPasswords: p.checkCommonPasswords,
    minZxcvbnScore: p.minZxcvbnScore,
    historySize: p.historySize,
    rotationDays: p.rotationDays,
  };
}

export function PreviewSection({ policy }: Props) {
  const { t } = useTranslations({ en, de });
  const [candidate, setCandidate] = useState('');
  const [reveal, setReveal] = useState(false);
  const [result, setResult] = useState<PreviewPasswordResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const inflight = useRef<{ cancel: () => void } | null>(null);

  const draft = useMemo(() => toDraftPolicy(policy), [policy]);

  useEffect(() => {
    if (candidate.length === 0) {
      setResult(null);
      setLoading(false);
      inflight.current?.cancel();
      return;
    }
    const id = ++generation.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      inflight.current?.cancel();
      const promise = PasswordPolicyAdminService.previewAdminPasswordPolicy({
        requestBody: { password: candidate, draftPolicy: draft },
      });
      inflight.current = { cancel: () => promise.cancel() };
      promise
        .then((next) => {
          if (id !== generation.current) return;
          setResult(next as PreviewPasswordResultDto);
          setLoading(false);
        })
        .catch(() => {
          if (id !== generation.current) return;
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [candidate, draft]);

  useEffect(() => () => inflight.current?.cancel(), []);

  return (
    <Card>
      <Card.Header className="flex flex-col items-start gap-1">
        <span className="text-base font-semibold">{t('preview.title')}</span>
        <span className="text-sm text-default-500">{t('preview.subtitle')}</span>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <TextField value={candidate} onChange={setCandidate} data-testid="policy-preview-input">
          <Label>{t('preview.passwordLabel')}</Label>
          <Input type={reveal ? 'text' : 'password'} autoComplete="new-password" />
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={reveal ? t('preview.hide') : t('preview.reveal')}
            onPress={() => setReveal((v) => !v)}
            data-testid="policy-preview-reveal"
          >
            {reveal ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </Button>
        </TextField>
        {candidate.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="policy-preview-result">
            {loading && !result ? (
              <div className="flex items-center gap-2 text-xs text-default-500">
                <Spinner size="sm" /> {t('preview.loading')}
              </div>
            ) : result ? (
              <>
                <Chip color={result.ok ? 'success' : 'danger'} variant="soft">
                  {result.ok ? <CheckIcon size={14} /> : <XIcon size={14} />}
                  {result.ok ? t('preview.pass') : t('preview.fail')}
                </Chip>
                {result.errors.length === 0 ? (
                  <span className="text-xs text-default-500">{t('preview.noErrors')}</span>
                ) : (
                  <ul className="list-disc pl-5 text-xs text-default-600">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>{renderError(err as unknown as PolicyError, t)}</li>
                    ))}
                  </ul>
                )}
                <span className="text-[10px] uppercase tracking-wide text-default-400">{t('preview.disclosure')}</span>
              </>
            ) : null}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

function renderError(err: PolicyError, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return t(`preview.errors.${err.code}`, err.params as Record<string, string | number>);
}
