import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Beacon, BeaconPosition, BeaconType, BleGateway, BleGatewayType } from '@attraccess/database-entities';
import { Observable, Subject } from 'rxjs';
import { normalizeMac, parseHolyiotBatteryPercentFromHex } from './beacons/beacon-parser.utils';
import { NormalizedGatewayAdvertisement } from './gateways/gateway-adapter.interface';
import { CreateGatewayDto } from './dtos/createGateway.dto';
import { UpdateGatewayDto } from './dtos/updateGateway.dto';
import { CreateBeaconDto } from './dtos/createBeacon.dto';
import { UpdateBeaconDto } from './dtos/updateBeacon.dto';

type DebugGateway = {
  id: number;
  identifier: string;
  type: BleGatewayType;
  mqttServerId: number;
  topic: string | null;
  subscribeQos: number | null;
  coordinates: { x: number | null; y: number | null };
  calibration: {
    txPowerAt1m: number | null;
    pathLossExponent: number | null;
    calibrationUpdatedAt: string | null;
  };
};

type DebugReading = {
  gateway: DebugGateway;
  rssi: number;
  filteredRssi: number | null;
  distance: number | null;
  battery: number | null;
  observedAt: string;
};

type DebugPosition = {
  x: number;
  y: number;
  residual: number | null;
  observedAt: string;
};

type DebugSample = {
  gateway: DebugGateway;
  rssi: number;
  filteredRssi: number | null;
  distance: number;
  observedAt: string;
};

type DebugBeacon = {
  identifier: string;
  type: BeaconType;
};

type InMemoryReading = {
  gateway: BleGateway;
  rssi: number;
  filteredRssi: number | null;
  distance: number | null;
  battery: number | null;
  observedAt: Date;
};

export type PositionalDebugEvent =
  | {
    type: 'reading';
    beaconIdentifier: string;
    observedAt: string;
    reading: DebugReading;
    latestReadings: DebugReading[];
    latestPosition: DebugPosition | null;
  }
  | {
    type: 'position';
    beaconIdentifier: string;
    observedAt: string;
    position: DebugPosition;
    inputSamples: DebugSample[];
  };

@Injectable()
export class PositionalTrackingService {
  private readonly logger = new Logger(PositionalTrackingService.name);
  // How long to keep computed positions.
  private readonly positionRetentionDays = 7;
  // Window used to ignore stale readings across gateways for trilateration.
  private readonly recentReadingWindowMs = 60 * 1000;
  // Throttle for how often we recompute a beacon's position.
  private readonly positionUpdateIntervalMs = 5 * 1000;
  private readonly lastPositionAtByBeacon = new Map<string, number>();
  private readonly recentReadingsByBeacon = new Map<string, Map<number, InMemoryReading>>();
  // Rolling median window size for RSSI smoothing.
  private readonly rssiWindowSize = 5;
  private readonly rssiWindowByKey = new Map<string, number[]>();
  // Defaults used when gateway calibration is missing.
  private readonly defaultTxPowerAt1m = -53;
  private readonly defaultPathLossExponent = 2.0;
  private readonly debugSubject = new Subject<PositionalDebugEvent>();

  constructor(
    @InjectRepository(Beacon)
    private readonly beaconRepository: Repository<Beacon>,
    @InjectRepository(BeaconPosition)
    private readonly beaconPositionRepository: Repository<BeaconPosition>,
    @InjectRepository(BleGateway)
    private readonly bleGatewayRepository: Repository<BleGateway>,
  ) { }

  getDebugStream(): Observable<PositionalDebugEvent> {
    return this.debugSubject.asObservable();
  }

  async listGatewaysForCalibration(): Promise<DebugGateway[]> {
    const gateways = await this.bleGatewayRepository.find({ order: { id: 'ASC' } });
    return gateways.map((gateway) => this.buildDebugGateway(gateway));
  }

  async getGatewayForCalibration(id: number): Promise<DebugGateway> {
    const gateway = await this.bleGatewayRepository.findOneBy({ id });
    if (!gateway) {
      throw new NotFoundException('Gateway not found');
    }
    return this.buildDebugGateway(gateway);
  }

  async updateGatewayCalibration(
    id: number,
    calibration: { txPowerAt1m: number; pathLossExponent: number; calibrationUpdatedAt?: string },
  ): Promise<DebugGateway> {
    const gateway = await this.bleGatewayRepository.findOneBy({ id });
    if (!gateway) {
      throw new NotFoundException('Gateway not found');
    }
    const updatedAt = calibration.calibrationUpdatedAt ? new Date(calibration.calibrationUpdatedAt) : new Date();
    gateway.calibration = {
      ...(gateway.calibration ?? {}),
      txPowerAt1m: calibration.txPowerAt1m,
      pathLossExponent: calibration.pathLossExponent,
      calibrationUpdatedAt: updatedAt,
    };
    const saved = await this.bleGatewayRepository.save(gateway);
    return this.buildDebugGateway(saved);
  }

  async createGateway(dto: CreateGatewayDto): Promise<DebugGateway> {
    const existing = await this.bleGatewayRepository.findOneBy({ identifier: dto.identifier });
    if (existing) {
      throw new ConflictException('Gateway identifier already exists');
    }
    const gateway = this.bleGatewayRepository.create({
      identifier: dto.identifier,
      type: dto.type,
      mqttServerId: dto.mqttServerId,
      topic: dto.topic ?? null,
      subscribeQos: dto.subscribeQos ?? null,
      coordinates: {
        x: dto.coordinates?.x ?? null,
        y: dto.coordinates?.y ?? null,
      },
      calibration: {
        txPowerAt1m: null,
        pathLossExponent: null,
        calibrationUpdatedAt: null,
      },
    });
    const saved = await this.bleGatewayRepository.save(gateway);
    return this.buildDebugGateway(saved);
  }

  async updateGateway(id: number, dto: UpdateGatewayDto): Promise<DebugGateway> {
    const gateway = await this.bleGatewayRepository.findOneBy({ id });
    if (!gateway) {
      throw new NotFoundException('Gateway not found');
    }
    if (dto.identifier && dto.identifier !== gateway.identifier) {
      const existing = await this.bleGatewayRepository.findOneBy({ identifier: dto.identifier });
      if (existing && existing.id !== id) {
        throw new ConflictException('Gateway identifier already exists');
      }
      gateway.identifier = dto.identifier;
    }
    if (dto.type !== undefined) {
      gateway.type = dto.type;
    }
    if (dto.mqttServerId !== undefined) {
      gateway.mqttServerId = dto.mqttServerId;
    }
    if (dto.topic !== undefined) {
      gateway.topic = dto.topic ?? null;
    }
    if (dto.subscribeQos !== undefined) {
      gateway.subscribeQos = dto.subscribeQos ?? null;
    }
    if (dto.coordinates) {
      gateway.coordinates = {
        x: dto.coordinates.x ?? null,
        y: dto.coordinates.y ?? null,
      };
    }
    const saved = await this.bleGatewayRepository.save(gateway);
    return this.buildDebugGateway(saved);
  }

  async deleteGateway(id: number): Promise<void> {
    const result = await this.bleGatewayRepository.delete({ id });
    if (!result.affected) {
      throw new NotFoundException('Gateway not found');
    }
  }

  async listBeacons(): Promise<DebugBeacon[]> {
    const beacons = await this.beaconRepository.find({ order: { identifier: 'ASC' } });
    return beacons.map((beacon) => this.buildDebugBeacon(beacon));
  }

  async createBeacon(dto: CreateBeaconDto): Promise<DebugBeacon> {
    const existing = await this.beaconRepository.findOneBy({ identifier: dto.identifier });
    if (existing) {
      throw new ConflictException('Beacon identifier already exists');
    }
    const beacon = this.beaconRepository.create({
      identifier: dto.identifier,
      type: dto.type,
      battery: null,
      lastSeenAt: new Date(),
    });
    const saved = await this.beaconRepository.save(beacon);
    return this.buildDebugBeacon(saved);
  }

  async updateBeacon(identifier: string, dto: UpdateBeaconDto): Promise<DebugBeacon> {
    const beacon = await this.beaconRepository.findOneBy({ identifier });
    if (!beacon) {
      throw new NotFoundException('Beacon not found');
    }
    if (dto.type !== undefined) {
      beacon.type = dto.type;
    }
    const saved = await this.beaconRepository.save(beacon);
    return this.buildDebugBeacon(saved);
  }

  async deleteBeacon(identifier: string): Promise<void> {
    const result = await this.beaconRepository.delete({ identifier });
    if (!result.affected) {
      throw new NotFoundException('Beacon not found');
    }
  }

  async processGatewayAdvertisement(
    gateway: BleGateway,
    advertisement: NormalizedGatewayAdvertisement,
  ): Promise<void> {
    if (!advertisement.dataHex) {
      this.logger.warn(`No data hex to parse`, advertisement);
      throw new Error(`No data hex to parse for gateway ${gateway.identifier} advertisement ${advertisement.mac}`);
    }

    const identifier = normalizeMac(advertisement.mac);
    if (!identifier) {
      this.logger.debug(`Unable to build beacon identifier for gateway ${gateway.identifier}`);
      return;
    }

    const trackedBeacon = await this.beaconRepository.findOneBy({
      identifier,
      type: BeaconType.HOLYIOT,
    });

    if (!trackedBeacon) {
      return;
    }

    this.logger.debug(`Advertisement from ${advertisement.mac} at ${advertisement.observedAt?.toISOString()}: ${advertisement.dataHex}`);

    const battery = parseHolyiotBatteryPercentFromHex(advertisement.dataHex);
    //if (battery === null) {
    //  this.logger.debug(`no battery to parse for gateway ${gateway.identifier} advertisement ${advertisement.mac}`);
    //  continue;
    //}

    this.logger.debug(`Battery: ${battery}`);

    const lastSeenAt = advertisement.observedAt ?? new Date();
    await this.updateBeaconEntity(trackedBeacon, {
      identifier,
      type: BeaconType.HOLYIOT,
      battery: battery ?? undefined,
      lastSeenAt,
    });

    const rssi = typeof advertisement.rssi === 'number' ? advertisement.rssi : null;

    const readingKey = `${gateway.id}:${identifier}`;
    const filteredRssi = this.computeFilteredRssi(readingKey, rssi);
    const distance = this.estimateDistance(filteredRssi, gateway);

    this.logger.debug(`Filtered RSSI: ${filteredRssi}`);
    this.logger.debug(`Distance: ${distance}`);

    this.storeReading(identifier, {
      gateway,
      rssi,
      filteredRssi,
      distance,
      battery: battery ?? undefined,
      observedAt: lastSeenAt,
    });

    const recentReadings = this.loadRecentReadings(identifier, lastSeenAt);
    const shouldUpdatePosition = this.shouldUpdatePosition(identifier, lastSeenAt);

    const position = shouldUpdatePosition
      ? await this.computeAndSavePosition(identifier, lastSeenAt, recentReadings)
      : null;

    this.logger.debug(`Position: ${position}`);

    if (position) {
      this.lastPositionAtByBeacon.set(identifier, lastSeenAt.getTime());
    }
    const latestReadings = this.getLatestReadingsByGateway(recentReadings);
    const latestPosition = position ?? (await this.findLatestPosition(identifier));

    this.debugSubject.next({
      type: 'reading',
      beaconIdentifier: identifier,
      observedAt: lastSeenAt.toISOString(),
      reading: this.buildDebugReading({
        gateway,
        rssi,
        filteredRssi,
        distance,
        battery: battery ?? undefined,
        observedAt: lastSeenAt,
      }),
      latestReadings: latestReadings.map((reading) => this.buildDebugReading(reading)),
      latestPosition,
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupTrackingHistory(): Promise<void> {
    const now = new Date();
    const positionCutoff = new Date(now.getTime() - this.positionRetentionDays * 24 * 60 * 60 * 1000);

    await this.beaconPositionRepository.delete({ observedAt: LessThan(positionCutoff) });
  }

  private computeFilteredRssi(readingKey: string, rssi: number): number {
    const window = this.rssiWindowByKey.get(readingKey) ?? [];
    window.push(rssi);
    if (window.length > this.rssiWindowSize) {
      window.shift();
    }
    this.rssiWindowByKey.set(readingKey, window);
    return this.median(window);
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  private estimateDistance(filteredRssi: number, gateway: BleGateway): number | null {
    const txPowerAt1m = gateway.calibration?.txPowerAt1m ?? this.defaultTxPowerAt1m;
    const pathLossExponent = gateway.calibration?.pathLossExponent ?? this.defaultPathLossExponent;
    if (!Number.isFinite(txPowerAt1m) || !Number.isFinite(pathLossExponent) || pathLossExponent <= 0) {
      return null;
    }
    return Math.pow(10, (txPowerAt1m - filteredRssi) / (10 * pathLossExponent));
  }

  private async computeAndSavePosition(
    beaconIdentifier: string,
    observedAt: Date,
    recentReadings?: InMemoryReading[],
  ): Promise<DebugPosition | null> {
    const readings = recentReadings ?? this.loadRecentReadings(beaconIdentifier, observedAt);
    if (readings.length === 0) {
      return;
    }

    const latestReadings = this.getLatestReadingsByGateway(readings);
    const inputSamples = latestReadings
      .map((reading) => {
        const gateway = reading.gateway;
        const x = gateway?.coordinates?.x ?? null;
        const y = gateway?.coordinates?.y ?? null;
        const distance = reading.distance;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(distance) || distance <= 0) {
          return null;
        }
        return {
          gateway: this.buildDebugGateway(gateway),
          rssi: reading.rssi,
          filteredRssi: reading.filteredRssi,
          distance,
          observedAt: reading.observedAt.toISOString(),
        };
      })
      .filter((sample): sample is DebugSample => sample !== null);

    if (inputSamples.length < 3) {
      return null;
    }

    const position = this.solveTrilateration2d(
      inputSamples.map((sample) => ({
        x: sample.gateway.coordinates.x ?? 0,
        y: sample.gateway.coordinates.y ?? 0,
        distance: sample.distance,
      })),
    );
    if (!position) {
      return null;
    }

    const debugPosition: DebugPosition = {
      x: position.x,
      y: position.y,
      residual: position.residual,
      observedAt: observedAt.toISOString(),
    };

    await this.beaconPositionRepository.save(
      this.beaconPositionRepository.create({
        beaconIdentifier,
        x: debugPosition.x,
        y: debugPosition.y,
        residual: debugPosition.residual,
        observedAt,
      }),
    );

    this.debugSubject.next({
      type: 'position',
      beaconIdentifier,
      observedAt: observedAt.toISOString(),
      position: debugPosition,
      inputSamples,
    });

    return debugPosition;
  }

  private solveTrilateration2d(
    samples: Array<{ x: number; y: number; distance: number }>,
  ): { x: number; y: number; residual: number } | null {
    if (samples.length < 3) {
      return null;
    }

    const reference = samples[0];
    const x0 = reference.x;
    const y0 = reference.y;
    const d0 = reference.distance;
    let a00 = 0;
    let a01 = 0;
    let a11 = 0;
    let b0 = 0;
    let b1 = 0;

    for (let i = 1; i < samples.length; i += 1) {
      const { x: xi, y: yi, distance: di } = samples[i];
      const aX = 2 * (xi - x0);
      const aY = 2 * (yi - y0);
      const b =
        d0 * d0 -
        di * di +
        xi * xi -
        x0 * x0 +
        yi * yi -
        y0 * y0;
      a00 += aX * aX;
      a01 += aX * aY;
      a11 += aY * aY;
      b0 += aX * b;
      b1 += aY * b;
    }

    const det = a00 * a11 - a01 * a01;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-6) {
      return null;
    }

    const x = (a11 * b0 - a01 * b1) / det;
    const y = (a00 * b1 - a01 * b0) / det;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    let sumSq = 0;
    for (const sample of samples) {
      const dx = x - sample.x;
      const dy = y - sample.y;
      const estimated = Math.sqrt(dx * dx + dy * dy);
      const error = estimated - sample.distance;
      sumSq += error * error;
    }
    const residual = Math.sqrt(sumSq / samples.length);
    return { x, y, residual };
  }

  private async updateBeaconEntity(
    existing: Beacon,
    data: Omit<Beacon, 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    await this.beaconRepository.save({
      ...existing,
      ...data,
      battery: data.battery ?? existing.battery,
    });
  }

  private buildDebugGateway(gateway: BleGateway | undefined): DebugGateway {
    if (!gateway) {
      return {
        id: -1,
        identifier: 'unknown',
        type: BleGatewayType.GLS10,
        mqttServerId: 0,
        topic: null,
        subscribeQos: null,
        coordinates: { x: null, y: null },
        calibration: { txPowerAt1m: null, pathLossExponent: null, calibrationUpdatedAt: null },
      };
    }
    return {
      id: gateway.id,
      identifier: gateway.identifier,
      type: gateway.type,
      mqttServerId: gateway.mqttServerId,
      topic: gateway.topic ?? null,
      subscribeQos: gateway.subscribeQos ?? null,
      coordinates: {
        x: gateway.coordinates?.x ?? null,
        y: gateway.coordinates?.y ?? null,
      },
      calibration: {
        txPowerAt1m: gateway.calibration?.txPowerAt1m ?? null,
        pathLossExponent: gateway.calibration?.pathLossExponent ?? null,
        calibrationUpdatedAt: gateway.calibration?.calibrationUpdatedAt
          ? gateway.calibration.calibrationUpdatedAt.toISOString()
          : null,
      },
    };
  }

  private buildDebugReading(
    reading: InMemoryReading,
  ): DebugReading {
    return {
      gateway: this.buildDebugGateway(reading.gateway),
      rssi: reading.rssi,
      filteredRssi: reading.filteredRssi ?? null,
      distance: reading.distance ?? null,
      battery: reading.battery ?? null,
      observedAt: reading.observedAt.toISOString(),
    };
  }

  private buildDebugBeacon(beacon: Beacon): DebugBeacon {
    return {
      identifier: beacon.identifier,
      type: beacon.type,
    };
  }

  private storeReading(beaconIdentifier: string, reading: InMemoryReading): void {
    const readingsByGateway = this.recentReadingsByBeacon.get(beaconIdentifier) ?? new Map<number, InMemoryReading>();
    readingsByGateway.set(reading.gateway.id, reading);
    this.recentReadingsByBeacon.set(beaconIdentifier, readingsByGateway);
    this.loadRecentReadings(beaconIdentifier, reading.observedAt);
  }

  private loadRecentReadings(beaconIdentifier: string, observedAt: Date): InMemoryReading[] {
    const readingsByGateway = this.recentReadingsByBeacon.get(beaconIdentifier);
    if (!readingsByGateway) {
      return [];
    }
    const windowStart = observedAt.getTime() - this.recentReadingWindowMs;
    const readings: InMemoryReading[] = [];
    for (const [gatewayId, reading] of readingsByGateway.entries()) {
      if (reading.observedAt.getTime() >= windowStart) {
        readings.push(reading);
      } else {
        readingsByGateway.delete(gatewayId);
      }
    }
    if (readingsByGateway.size === 0) {
      this.recentReadingsByBeacon.delete(beaconIdentifier);
    }
    return readings;
  }

  private getLatestReadingsByGateway(readings: InMemoryReading[]): InMemoryReading[] {
    return readings;
  }

  private async findLatestPosition(beaconIdentifier: string): Promise<DebugPosition | null> {
    const latest = await this.beaconPositionRepository.findOne({
      where: { beaconIdentifier },
      order: { observedAt: 'DESC' },
    });
    if (!latest) {
      return null;
    }
    return {
      x: latest.x,
      y: latest.y,
      residual: latest.residual,
      observedAt: latest.observedAt.toISOString(),
    };
  }

  private shouldUpdatePosition(beaconIdentifier: string, observedAt: Date): boolean {
    const lastPositionAt = this.lastPositionAtByBeacon.get(beaconIdentifier) ?? 0;
    return observedAt.getTime() - lastPositionAt >= this.positionUpdateIntervalMs;
  }
}
