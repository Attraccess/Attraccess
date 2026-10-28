// Lets a participant who scanned a mass-introduction QR code join by typing the code shown next to it
// FEATURE: ATT-1151 Mass introduction
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Description } from '@heroui/react';
import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  MassIntroductionSessionDto,
  MassIntroductionTargetType,
  RedeemMassIntroductionResponseDto,
  useAccessControlServiceMassIntroductionRedeem,
} from '@attraccess/react-query-client';
import { OneTimeCodeInput } from '../../components/OneTimeCodeInput';
import { getApiErrorMessage } from '../../utils/apiError';
import en from './en.json';
import de from './de.json';

/** Query parameter naming the session in the QR code. Not a secret: joining needs the shown code. */
export const MASS_INTRODUCTION_PARAM = 'massIntroduction';

const CODE_LENGTH = 6;

/**
 * Where a session's QR code points: the resource's details page, or the resource overview for a
 * group (its page is an editor for managers). Signed-out participants log in there first.
 */
export function massIntroductionUrl(session: Pick<MassIntroductionSessionDto, 'publicId' | 'target'>): string {
  const url = new URL(window.location.origin);
  url.pathname =
    session.target.type === MassIntroductionTargetType.RESOURCE ? `/resources/${session.target.id}` : '/resources';
  url.searchParams.set(MASS_INTRODUCTION_PARAM, session.publicId);
  return url.toString();
}

type DialogState =
  | { status: 'code'; publicId: string; error: string | null }
  | { status: 'success'; result: RedeemMassIntroductionResponseDto }
  | { status: 'ended' };

interface Props {
  /** Signed in and past the two-factor gate. */
  canRedeem: boolean;
}

/**
 * Mount once in the app shell. After scanning (and signing in, if needed), asks for the code shown
 * next to the QR code and joins the session. Renders nothing without a session in the URL.
 */
export function MassIntroductionRedeemModal({ canRedeem }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<DialogState | null>(null);
  const [code, setCode] = useState('');

  const { mutate: redeem, isPending } = useAccessControlServiceMassIntroductionRedeem({
    onSuccess: (result) => {
      setState({ status: 'success', result });
      // The page behind the dialog may change with the new introduction (usage controls, people).
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      const status = (error as ApiError)?.status;
      setCode('');
      setState((current) => {
        if (current?.status !== 'code') return current;
        if (status === 404) return { status: 'ended' };
        if (status === 400) return { ...current, error: t('join.wrongCode') };
        if (status === 429) return { ...current, error: t('join.tooManyAttempts') };
        return { ...current, error: t('error.generic', { error: getApiErrorMessage(error as ApiError) }) };
      });
    },
  });

  // Open the code dialog once the participant can join; drop the session from the URL so a reload
  // or a shared link does not reopen it.
  const publicId = searchParams.get(MASS_INTRODUCTION_PARAM);
  useEffect(() => {
    if (!publicId || !canRedeem) return;
    setState({ status: 'code', publicId, error: null });
    setCode('');
    setSearchParams(
      (params) => {
        params.delete(MASS_INTRODUCTION_PARAM);
        return params;
      },
      { replace: true },
    );
  }, [publicId, canRedeem, setSearchParams]);

  const submit = useCallback(
    (value: string) => {
      if (state?.status !== 'code' || value.length !== CODE_LENGTH || isPending) return;
      redeem({ requestBody: { publicId: state.publicId, code: value } });
    },
    [state, isPending, redeem],
  );

  if (!state) return null;
  const close = () => setState(null);

  if (state.status === 'code') {
    return (
      <StatusDialog
        isOpen
        onClose={close}
        status="info"
        title={t('join.title')}
        action={{
          label: t('join.submit'),
          onPress: () => submit(code),
          isPending,
          isDisabled: code.length !== CODE_LENGTH,
          'data-cy': 'mass-introduction-join-submit',
        }}
        data-cy="mass-introduction-join"
      >
        <div className="flex flex-col items-center gap-3">
          <Description>{t('join.description')}</Description>
          <OneTimeCodeInput
            label={t('join.codeLabel')}
            value={code}
            onChange={(value) => {
              setCode(value);
              // Joining right away saves a tap; the code is only valid for a few seconds.
              submit(value);
            }}
            length={CODE_LENGTH}
            autoFocus
            isDisabled={isPending}
            data-cy="mass-introduction-join-code"
          />
          {state.error && (
            <Description className="text-danger" role="alert">
              {state.error}
            </Description>
          )}
        </div>
      </StatusDialog>
    );
  }

  if (state.status === 'success') {
    return (
      <StatusDialog
        isOpen
        onClose={close}
        status="success"
        title={t('success.title')}
        closeLabel={t('close')}
        data-cy="mass-introduction-redeem-success"
      >
        {t(state.result.alreadyIntroduced ? 'success.alreadyIntroduced' : 'success.introduced', {
          name: state.result.target.name,
        })}
      </StatusDialog>
    );
  }

  return (
    <StatusDialog
      isOpen
      onClose={close}
      status="error"
      title={t('error.title')}
      closeLabel={t('close')}
      data-cy="mass-introduction-redeem-error"
    >
      {t('error.ended')}
    </StatusDialog>
  );
}
