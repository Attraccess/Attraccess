import { AttractapEvent } from '../websocket.types';
import { HandleCardAuthenticationRequestTestScope } from './card.handler.spec';
export function registerHandleCardAuthenticationRequestAlwaysIncrementsAttractapNfcTapsTotal(
  scope: HandleCardAuthenticationRequestTestScope,
): void {
  it('always increments attractapNfcTapsTotal', async () => {
    const socket = scope.createMockSocket();
    const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

    await scope.handler.handleCardAuthenticationRequest(socket, data);

    expect(scope.metricsService.attractapNfcTapsTotal.inc).toHaveBeenCalledTimes(1);
  });
}
