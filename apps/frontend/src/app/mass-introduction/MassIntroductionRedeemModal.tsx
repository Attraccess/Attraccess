// Redeems a scanned mass-introduction QR code on the page it points to and reports the result in a modal
// FEATURE: ATT-1151 Mass introduction
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertContent,
  AlertDescription,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  MassIntroductionSessionDto,
  MassIntroductionTargetType,
  RedeemMassIntroductionResponseDto,
  useAccessControlServiceMassIntroductionRedeem,
} from '@attraccess/react-query-client';
import { Button } from '../../components/button';
import { StandardModal } from '../../components/standardModal';
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
  | { status: 'pending' }
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
    setState({ status: 'pending' });
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

  if (!state) return null;

  const close = () => setState(null);
  let title = t('pending');
  let message = '';
  if (state.status === 'success') {
    title = t('success.title');
    message = t(state.result.alreadyIntroduced ? 'success.alreadyIntroduced' : 'success.introduced', {
      name: state.result.target.name,
    });
  } else if (state.status === 'error') {
    title = t('error.title');
    message = state.isInvalidOrExpired ? t('error.invalidOrExpired') : t('error.generic', { error: state.detail });
  }

  return (
    <StandardModal
      isOpen
      onOpenChange={(isOpen) => !isOpen && state.status !== 'pending' && close()}
      size="sm"
      data-cy="mass-introduction-redeem-modal"
    >
      <ModalHeader>
        <ModalHeading>{title}</ModalHeading>
      </ModalHeader>
      <ModalBody>
        {state.status === 'pending' ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <Alert
            status={state.status === 'success' ? 'success' : 'danger'}
            data-cy={`mass-introduction-redeem-${state.status}`}
          >
            <AlertContent>
              <AlertDescription>{message}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </ModalBody>
      {state.status !== 'pending' && (
        <ModalFooter>
          <Button variant="primary" onPress={close} data-cy="mass-introduction-redeem-close">
            {t('close')}
          </Button>
        </ModalFooter>
      )}
    </StandardModal>
  );
}
