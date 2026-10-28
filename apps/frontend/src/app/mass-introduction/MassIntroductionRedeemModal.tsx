// Redeems a scanned mass-introduction QR code and reports the result in a dialog
// FEATURE: ATT-1151 Mass introduction
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  MassIntroductionSessionDto,
  MassIntroductionTargetType,
  RedeemMassIntroductionResponseDto,
  useAccessControlServiceMassIntroductionClaim,
  useAccessControlServiceMassIntroductionRedeem,
} from '@attraccess/react-query-client';
import { StatusDialog } from '../../components/statusDialog';
import { getApiErrorMessage } from '../../utils/apiError';
import en from './en.json';
import de from './de.json';

/** Query parameter carrying the QR code's value; it changes every 15 seconds. */
export const MASS_INTRODUCTION_PARAM = 'massIntroduction';

/** Query parameter carrying the ticket for a scanned code, so it survives signing in. */
export const MASS_INTRODUCTION_TICKET_PARAM = 'massIntroductionTicket';

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

interface Props {
  /** Signed in and past the two-factor gate. */
  canRedeem: boolean;
}

/**
 * Mount once, for signed-in and signed-out users alike. A scanned code is exchanged for a ticket
 * right away, because it would expire while a signed-out participant logs in; the ticket is
 * redeemed once they can. Renders nothing without a code or ticket in the URL.
 */
export function MassIntroductionRedeemModal({ canRedeem }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<RedeemState | null>(null);
  // Codes and tickets are single-use; act on each once even under StrictMode/re-renders.
  const claimedCode = useRef<string | null>(null);
  const redeemedTicket = useRef<string | null>(null);

  const showError = (error: unknown) =>
    setState({
      status: 'error',
      isInvalidOrExpired: (error as ApiError)?.status === 404,
      detail: getApiErrorMessage(error as ApiError),
    });

  // Reloading or sharing the page must not use a code or ticket again.
  const replaceParams = useCallback(
    (update: (params: URLSearchParams) => void) =>
      setSearchParams(
        (params) => {
          update(params);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const { mutate: claim } = useAccessControlServiceMassIntroductionClaim({
    onSuccess: ({ ticket }) =>
      replaceParams((params) => {
        params.delete(MASS_INTRODUCTION_PARAM);
        params.set(MASS_INTRODUCTION_TICKET_PARAM, ticket);
      }),
    onError: (error) => {
      replaceParams((params) => params.delete(MASS_INTRODUCTION_PARAM));
      showError(error);
    },
  });

  const { mutate: redeem } = useAccessControlServiceMassIntroductionRedeem({
    onSuccess: (result) => {
      setState({ status: 'success', result });
      // The page behind the dialog may change with the new introduction (usage controls, people).
      void queryClient.invalidateQueries();
    },
    onError: showError,
  });

  const code = searchParams.get(MASS_INTRODUCTION_PARAM);
  useEffect(() => {
    if (!code || claimedCode.current === code) return;
    claimedCode.current = code;
    claim({ requestBody: { token: code } });
  }, [code, claim]);

  const ticket = searchParams.get(MASS_INTRODUCTION_TICKET_PARAM);
  useEffect(() => {
    if (!ticket || !canRedeem || redeemedTicket.current === ticket) return;
    redeemedTicket.current = ticket;
    redeem({ requestBody: { ticket } });
    replaceParams((params) => params.delete(MASS_INTRODUCTION_TICKET_PARAM));
  }, [ticket, canRedeem, redeem, replaceParams]);

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
