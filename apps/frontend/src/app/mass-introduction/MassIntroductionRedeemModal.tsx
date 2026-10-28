// Redeems a scanned mass-introduction QR code on the page it points to and reports the result in a dialog
// FEATURE: ATT-1151 Mass introduction
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  MassIntroductionSessionDto,
  MassIntroductionTargetType,
  RedeemMassIntroductionResponseDto,
  useAccessControlServiceMassIntroductionRedeem,
} from '@attraccess/react-query-client';
import { StatusDialog } from '../../components/statusDialog';
import { getApiErrorMessage } from '../../utils/apiError';
import en from './en.json';
import de from './de.json';

/** Query parameter carrying the QR code's token. */
export const MASS_INTRODUCTION_PARAM = 'massIntroduction';

/**
 * Where a session's QR code points: the resource's details page, or the resource overview for a
 * group (its page is an editor for managers). Signed-out participants log in there first.
 */
export function massIntroductionUrl(session: Pick<MassIntroductionSessionDto, 'token' | 'target'>): string {
  const url = new URL(window.location.origin);
  url.pathname =
    session.target.type === MassIntroductionTargetType.RESOURCE ? `/resources/${session.target.id}` : '/resources';
  url.searchParams.set(MASS_INTRODUCTION_PARAM, session.token);
  return url.toString();
}

type RedeemState =
  | { status: 'success'; result: RedeemMassIntroductionResponseDto }
  | { status: 'error'; isInvalidOrExpired: boolean; detail: string };

/** Mount on every page a QR code can point to; renders nothing without a token in the URL. */
export function MassIntroductionRedeemModal() {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<RedeemState | null>(null);
  // A token grants an introduction; redeem it once even under StrictMode/re-renders.
  const redeemedToken = useRef<string | null>(null);

  const { mutate: redeem } = useAccessControlServiceMassIntroductionRedeem({
    onSuccess: (result) => {
      setState({ status: 'success', result });
      // The page behind the modal may change with the new introduction (usage controls, people).
      void queryClient.invalidateQueries();
    },
    onError: (error) =>
      setState({
        status: 'error',
        isInvalidOrExpired: (error as ApiError)?.status === 404,
        detail: getApiErrorMessage(error as ApiError),
      }),
  });

  const token = searchParams.get(MASS_INTRODUCTION_PARAM);
  useEffect(() => {
    if (!token || redeemedToken.current === token) return;
    redeemedToken.current = token;
    redeem({ requestBody: { token } });
    // Reloading or sharing the page must not redeem again.
    setSearchParams(
      (params) => {
        params.delete(MASS_INTRODUCTION_PARAM);
        return params;
      },
      { replace: true },
    );
  }, [token, redeem, setSearchParams]);

  // The redemption is quick; the dialog appears with its result.
  if (!state) return null;

  const close = () => setState(null);
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
      {state.isInvalidOrExpired ? t('error.invalidOrExpired') : t('error.generic', { error: state.detail })}
    </StatusDialog>
  );
}
