import { useEffect, useMemo, useRef, useState } from 'react';
import { Chip, InputGroup, Spinner, TextField } from '@heroui/react';
import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from 'lucide-react';
import type { PolicyError } from '@attraccess/shared';
import {
  PasswordPolicyAdminService,
  PasswordPolicyDto,
  PreviewPasswordResultDto,
  UpdatePasswordPolicyDto,
} from '@attraccess/react-query-client';
import { Button } from '../../../../components/button';

const DEBOUNCE_MS = 400;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

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

/**
 * The password-strength preview, moved into the section's aside.
 *
 * It is reference material in the strictest sense: it changes nothing, it exists only to explain
 * the fields beside it, and it evaluates the *unsaved* form values — which is what makes it worth
 * the round trip, since HIBP, zxcvbn and the common-password list can only run server-side.
 */
export function PasswordPreview({ policy, t }: { policy: PasswordPolicyDto; t: Translate }) {
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
    // A generation counter as well as cancellation: a request that has already resolved cannot be
    // cancelled, so without it a slow early response could still land after a fast later one.
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
    return () => window.clearTimeout(timer);
  }, [candidate, draft]);

  useEffect(() => () => inflight.current?.cancel(), []);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{t('preview.title')}</h3>
      <p className="text-xs text-muted">{t('preview.subtitle')}</p>

      <TextField
        value={candidate}
        onChange={setCandidate}
        aria-label={t('preview.passwordLabel')}
        data-testid="policy-preview-input"
      >
        <InputGroup>
          <InputGroup.Input type={reveal ? 'text' : 'password'} autoComplete="new-password" />
          <InputGroup.Suffix>
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
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      {candidate.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="policy-preview-result">
          {loading && !result ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Spinner size="sm" /> {t('preview.loading')}
            </div>
          ) : result ? (
            <>
              <div>
                <Chip color={result.ok ? 'success' : 'danger'} variant="soft">
                  <span className="flex items-center gap-1">
                    {result.ok ? <CheckIcon size={14} /> : <XIcon size={14} />}
                    {result.ok ? t('preview.pass') : t('preview.fail')}
                  </span>
                </Chip>
              </div>
              {result.errors.length === 0 ? (
                <span className="text-xs text-muted">{t('preview.noErrors')}</span>
              ) : (
                <ul className="list-disc pl-5 text-xs text-foreground">
                  {result.errors.map((err, idx) => {
                    const error = err as unknown as PolicyError;
                    return (
                      <li key={idx}>
                        {t(`preview.errors.${error.code}`, error.params as Record<string, string | number>)}
                      </li>
                    );
                  })}
                </ul>
              )}
              <span className="text-xs text-muted">{t('preview.disclosure')}</span>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
