// Landing page for a scanned mass-introduction QR code: redeems the token for the signed-in user
// FEATURE: ATT-1151 Mass introduction
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertContent, AlertDescription, Card, Spinner } from '@heroui/react';
import { useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  MassIntroductionTargetType,
  RedeemMassIntroductionResponseDto,
  useAccessControlServiceMassIntroductionRedeem,
} from '@attraccess/react-query-client';
import { Button } from '../../components/button';
import { getApiErrorMessage } from '../../utils/apiError';
import en from './en.json';
import de from './de.json';

type RedeemState =
  | { status: 'pending' }
  | { status: 'success'; result: RedeemMassIntroductionResponseDto }
  | { status: 'error'; isInvalidOrExpired: boolean; detail: string };

export function MassIntroductionLandingPage() {
  const { t } = useTranslations({ en, de });
  const query = useUrlQuery();
  const navigate = useNavigate();
  const token = useMemo(() => query.get('token'), [query]);
  const [state, setState] = useState<RedeemState>({ status: 'pending' });
  // A token grants an introduction; redeem it once even under StrictMode/re-renders.
  const redeemedToken = useRef<string | null>(null);

  const { mutate: redeem } = useAccessControlServiceMassIntroductionRedeem({
    onSuccess: (result) => setState({ status: 'success', result }),
    onError: (error) =>
      setState({
        status: 'error',
        isInvalidOrExpired: (error as ApiError)?.status === 404,
        detail: getApiErrorMessage(error as ApiError),
      }),
  });

  useEffect(() => {
    if (!token || redeemedToken.current === token) return;
    redeemedToken.current = token;
    setState({ status: 'pending' });
    redeem({ requestBody: { token } });
  }, [token, redeem]);

  const view: RedeemState = token ? state : { status: 'error', isInvalidOrExpired: false, detail: '' };
  let errorMessage = '';
  if (view.status === 'error') {
    if (!token) errorMessage = t('error.missingToken');
    else if (view.isInvalidOrExpired) errorMessage = t('error.invalidOrExpired');
    else errorMessage = t('error.generic', { error: view.detail });
  }

  return (
    <div className="flex justify-center py-12">
      <Card className="max-w-md w-full" data-cy="mass-introduction-landing">
        {view.status === 'pending' && (
          <Card.Content className="flex flex-col items-center gap-3 py-6">
            <Spinner />
            <Card.Description>{t('pending')}</Card.Description>
          </Card.Content>
        )}

        {view.status === 'success' && (
          <>
            <Card.Header>
              <Card.Title>{t('success.title')}</Card.Title>
            </Card.Header>
            <Card.Content>
              <Alert status="success" data-cy="mass-introduction-landing-success">
                <AlertContent>
                  <AlertDescription>
                    {t(view.result.alreadyIntroduced ? 'success.alreadyIntroduced' : 'success.introduced', {
                      name: view.result.target.name,
                    })}
                  </AlertDescription>
                </AlertContent>
              </Alert>
            </Card.Content>
            <Card.Footer>
              {view.result.target.type === MassIntroductionTargetType.RESOURCE ? (
                <Button
                  variant="primary"
                  fullWidth
                  onPress={() => navigate(`/resources/${view.result.target.id}`)}
                  data-cy="mass-introduction-landing-open-resource"
                >
                  {t('success.openResource')}
                </Button>
              ) : (
                // The group page is an editor for managers; participants find the group's resources in the overview.
                <Button
                  variant="primary"
                  fullWidth
                  onPress={() => navigate('/resources')}
                  data-cy="mass-introduction-landing-open-resources"
                >
                  {t('success.openResources')}
                </Button>
              )}
            </Card.Footer>
          </>
        )}

        {view.status === 'error' && (
          <>
            <Card.Header>
              <Card.Title>{t('error.title')}</Card.Title>
            </Card.Header>
            <Card.Content>
              <Alert status="danger" data-cy="mass-introduction-landing-error">
                <AlertContent>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </AlertContent>
              </Alert>
            </Card.Content>
            <Card.Footer>
              <Button variant="outline" fullWidth onPress={() => navigate('/resources')}>
                {t('error.backToResources')}
              </Button>
            </Card.Footer>
          </>
        )}
      </Card>
    </div>
  );
}
