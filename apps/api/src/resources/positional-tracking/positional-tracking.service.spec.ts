import { Repository } from 'typeorm';
import { Beacon, BeaconPosition, BleGateway } from '@attraccess/database-entities';
import { PositionalTrackingService } from './positional-tracking.service';

interface PositionalTrackingServicePrivate {
  computeFilteredRssi: (readingKey: string, rssi: number) => number;
  estimateDistance: (filteredRssi: number, gateway: BleGateway) => number | null;
  solveTrilateration2d: (
    samples: Array<{ x: number; y: number; distance: number }>,
  ) => { x: number; y: number; residual: number } | null;
}

describe('PositionalTrackingService', () => {
  let service: PositionalTrackingService;

  beforeEach(() => {
    service = new PositionalTrackingService(
      {} as Repository<Beacon>,
      {} as Repository<BeaconPosition>,
      {} as Repository<BleGateway>,
    );
  });

  it('computes median filtered RSSI from a rolling window', () => {
    const servicePrivate = service as unknown as PositionalTrackingServicePrivate;
    const key = 'gateway-1:beacon-1';

    servicePrivate.computeFilteredRssi(key, -80);
    servicePrivate.computeFilteredRssi(key, -70);
    servicePrivate.computeFilteredRssi(key, -75);

    const filtered = servicePrivate.computeFilteredRssi(key, -65);
    expect(filtered).toBe(-72.5);
  });

  it('estimates distance using default calibration when missing', () => {
    const servicePrivate = service as unknown as PositionalTrackingServicePrivate;
    const gateway = {
      calibration: {
        txPowerAt1m: null,
        pathLossExponent: null,
        calibrationUpdatedAt: null,
      },
    } as BleGateway;

    const distance = servicePrivate.estimateDistance(-70, gateway);
    const expected = Math.pow(10, (-59 - -70) / (10 * 2.0));
    expect(distance).toBeCloseTo(expected, 6);
  });

  it('returns null when path loss exponent is invalid', () => {
    const servicePrivate = service as unknown as PositionalTrackingServicePrivate;
    const gateway = {
      calibration: {
        txPowerAt1m: -59,
        pathLossExponent: 0,
        calibrationUpdatedAt: null,
      },
    } as BleGateway;

    expect(servicePrivate.estimateDistance(-70, gateway)).toBeNull();
  });

  it('solves trilateration with three gateways', () => {
    const servicePrivate = service as unknown as PositionalTrackingServicePrivate;
    const samples = [
      { x: 0, y: 0, distance: 5 },
      { x: 10, y: 0, distance: Math.sqrt(65) },
      { x: 0, y: 10, distance: Math.sqrt(45) },
    ];

    const result = servicePrivate.solveTrilateration2d(samples);
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.x).toBeCloseTo(3, 4);
    expect(result.y).toBeCloseTo(4, 4);
    expect(result.residual).toBeLessThan(1e-3);
  });

  it('returns null when fewer than three gateways are provided', () => {
    const servicePrivate = service as unknown as PositionalTrackingServicePrivate;
    const result = servicePrivate.solveTrilateration2d([
      { x: 0, y: 0, distance: 5 },
      { x: 10, y: 0, distance: 5 },
    ]);

    expect(result).toBeNull();
  });
});
