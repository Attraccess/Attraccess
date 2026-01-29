import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSSE } from '../../utils/sse';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { CRS, LatLngBoundsExpression } from 'leaflet';
import { CircleMarker, MapContainer, Pane, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getBaseUrl } from '../../api';
import {
  CalibrationSample,
  CalibrationRegressionResult,
  computeCalibrationRegression,
} from './positional-tracking.calibration';

type DebugGateway = {
  id: number;
  identifier: string;
  coordinates: { x: number | null; y: number | null };
  calibration: { txPowerAt1m: number | null; pathLossExponent: number | null; calibrationUpdatedAt: string | null };
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

type DebugEvent =
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

type BeaconState = {
  latestReadings: DebugReading[];
  latestPosition: DebugPosition | null;
  lastReading: DebugReading | null;
  lastEventAt: string | null;
};

type CalibrationRow = CalibrationSample & {
  lastSampleAt: string | null;
};

type CalibrationGateway = DebugGateway;

type CalibrationRequestState = 'idle' | 'loading' | 'saving' | 'error';

type CalibrationSamplingState = {
  gatewayId: number | null;
  beaconIdentifier: string | null;
  activeDistance: number | null;
};

type CalibrationStats = {
  distance: number;
  sampleCount: number;
  mean: number | null;
  stddev: number | null;
  lastSampleAt: string | null;
};

const emptySamplingState: CalibrationSamplingState = {
  gatewayId: null,
  beaconIdentifier: null,
  activeDistance: null,
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function formatRelativeSeconds(isoTimestamp: string, nowMs: number) {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return '-';
  }
  const diffSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  return diffSeconds === 1 ? '1 second ago' : `${diffSeconds} seconds ago`;
}

function MapBoundsUpdater({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);

  return null;
}

export function PositionalTrackingDebugPage() {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'open'>('connecting');
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [beacons, setBeacons] = useState<Record<string, BeaconState>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [calibrationGateways, setCalibrationGateways] = useState<CalibrationGateway[]>([]);
  const [calibrationState, setCalibrationState] = useState<CalibrationRequestState>('idle');
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [selectedGatewayId, setSelectedGatewayId] = useState<number | null>(null);
  const [selectedBeaconIdentifier, setSelectedBeaconIdentifier] = useState<string | null>(null);
  const [distanceInput, setDistanceInput] = useState('');
  const [calibrationRows, setCalibrationRows] = useState<CalibrationRow[]>([]);
  const [activeDistance, setActiveDistance] = useState<number | null>(null);
  const samplingRef = useRef<CalibrationSamplingState>(emptySamplingState);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    samplingRef.current = {
      gatewayId: selectedGatewayId,
      beaconIdentifier: selectedBeaconIdentifier,
      activeDistance,
    };
  }, [selectedGatewayId, selectedBeaconIdentifier, activeDistance]);

  const loadCalibrationGateways = useCallback(async () => {
    setCalibrationState('loading');
    setCalibrationError(null);
    try {
      const gateways = await fetchJson<CalibrationGateway[]>('/api/positional-tracking/gateways');
      setCalibrationGateways(gateways);
      setCalibrationState('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load gateways';
      setCalibrationError(message);
      setCalibrationState('error');
    }
  }, []);

  useEffect(() => {
    void loadCalibrationGateways();
  }, [loadCalibrationGateways]);

  useEffect(() => {
    if (selectedGatewayId === null && calibrationGateways.length > 0) {
      setSelectedGatewayId(calibrationGateways[0].id);
    }
  }, [selectedGatewayId, calibrationGateways]);

  useEffect(() => {
    const identifiers = Object.keys(beacons);
    if (!selectedBeaconIdentifier && identifiers.length > 0) {
      setSelectedBeaconIdentifier(identifiers[0]);
    }
  }, [selectedBeaconIdentifier, beacons]);

  const handleSseUpdate = useCallback((parsed: DebugEvent) => {
    setConnectionStatus('open');
    setLastEventAt(new Date().toISOString());
    setBeacons((prev) => {
      const current = prev[parsed.beaconIdentifier] ?? {
        latestReadings: [],
        latestPosition: null,
        lastReading: null,
        lastEventAt: null,
      };
      if (parsed.type === 'reading') {
        return {
          ...prev,
          [parsed.beaconIdentifier]: {
            latestReadings: parsed.latestReadings.sort((a, b) => a.gateway.identifier.localeCompare(b.gateway.identifier)),
            latestPosition: parsed.latestPosition,
            lastReading: parsed.reading,
            lastEventAt: parsed.observedAt,
          },
        };
      }
      return {
        ...prev,
        [parsed.beaconIdentifier]: {
          ...current,
          latestPosition: parsed.position,
          lastEventAt: parsed.observedAt,
        },
      };
    });

    if (parsed.type !== 'reading') {
      return;
    }
    const { gatewayId, beaconIdentifier, activeDistance: samplingDistance } = samplingRef.current;
    if (
      gatewayId === null ||
      beaconIdentifier === null ||
      samplingDistance === null ||
      parsed.beaconIdentifier !== beaconIdentifier ||
      parsed.reading.gateway.id !== gatewayId
    ) {
      return;
    }
    const rssiValue = parsed.reading.filteredRssi ?? parsed.reading.rssi;
    if (!Number.isFinite(rssiValue)) {
      return;
    }
    setCalibrationRows((prev) =>
      prev.map((row) => {
        if (row.distance !== samplingDistance) {
          return row;
        }
        return {
          ...row,
          samples: [...row.samples, rssiValue],
          lastSampleAt: parsed.observedAt,
        };
      }),
    );
  }, []);

  useSSE<DebugEvent>({
    path: '/api/positional-tracking/debug',
    onUpdate: handleSseUpdate,
  });

  const gateways = useMemo(() => {
    const map = new Map<number, DebugGateway>();
    calibrationGateways.forEach((gateway) => {
      map.set(gateway.id, gateway);
    });
    Object.values(beacons).forEach((beacon) => {
      beacon.latestReadings.forEach((reading) => {
        map.set(reading.gateway.id, reading.gateway);
      });
      if (beacon.lastReading) {
        map.set(beacon.lastReading.gateway.id, beacon.lastReading.gateway);
      }
    });
    return [...map.values()];
  }, [beacons, calibrationGateways]);

  const positions = useMemo(() => {
    return Object.entries(beacons)
      .map(([identifier, beacon]) => {
        if (!beacon.latestPosition) {
          return null;
        }
        return {
          identifier,
          position: beacon.latestPosition,
        };
      })
      .filter((entry): entry is { identifier: string; position: DebugPosition } => entry !== null);
  }, [beacons]);

  const plotData = useMemo(() => {
    const points: Array<{ x: number; y: number }> = [];
    gateways.forEach((gateway) => {
      if (gateway.coordinates.x !== null && gateway.coordinates.y !== null) {
        points.push({ x: gateway.coordinates.x, y: gateway.coordinates.y });
      }
    });
    positions.forEach((pos) => {
      points.push({ x: pos.position.x, y: pos.position.y });
    });
    if (points.length === 0) {
      return null;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = Math.max(1, maxX - minX);
    const rangeY = Math.max(1, maxY - minY);
    return {
      minX,
      minY,
      rangeX,
      rangeY,
    };
  }, [gateways, positions]);

  const formatNumber = (value: number | null | undefined, digits = 2) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '-';
    }
    return value.toFixed(digits);
  };

  const calibrationStats = useMemo<CalibrationStats[]>(() => {
    return calibrationRows.map((row) => {
      const count = row.samples.length;
      if (count === 0) {
        return {
          distance: row.distance,
          sampleCount: 0,
          mean: null,
          stddev: null,
          lastSampleAt: row.lastSampleAt,
        };
      }
      const sum = row.samples.reduce((total, value) => total + value, 0);
      const mean = sum / count;
      const variance =
        count > 1 ? row.samples.reduce((total, value) => total + (value - mean) ** 2, 0) / count : 0;
      const stddev = Math.sqrt(variance);
      return {
        distance: row.distance,
        sampleCount: count,
        mean,
        stddev,
        lastSampleAt: row.lastSampleAt,
      };
    });
  }, [calibrationRows]);

  const regressionResult = useMemo<CalibrationRegressionResult | null>(() => {
    return computeCalibrationRegression(calibrationRows);
  }, [calibrationRows]);

  const addDistanceRow = () => {
    const parsed = Number(distanceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setCalibrationRows((prev) => {
      if (prev.some((row) => row.distance === parsed)) {
        return prev;
      }
      return [...prev, { distance: parsed, samples: [], lastSampleAt: null }].sort((a, b) => a.distance - b.distance);
    });
    setDistanceInput('');
  };

  const toggleSampling = (distance: number) => {
    setActiveDistance((current) => (current === distance ? null : distance));
  };

  const clearSamples = (distance: number) => {
    setCalibrationRows((prev) =>
      prev.map((row) => (row.distance === distance ? { ...row, samples: [], lastSampleAt: null } : row)),
    );
  };

  useEffect(() => {
    setActiveDistance(null);
  }, [selectedGatewayId, selectedBeaconIdentifier]);

  const handleSaveCalibration = async () => {
    if (!regressionResult || selectedGatewayId === null) {
      return;
    }
    setCalibrationState('saving');
    setCalibrationError(null);
    try {
      const saved = await fetchJson<CalibrationGateway>(`/api/positional-tracking/gateways/${selectedGatewayId}/calibration`, {
        method: 'PUT',
        body: JSON.stringify({
          txPowerAt1m: regressionResult.txPowerAt1m,
          pathLossExponent: regressionResult.pathLossExponent,
        }),
      });
      setCalibrationGateways((prev) => {
        const exists = prev.some((gateway) => gateway.id === saved.id);
        if (!exists) {
          return [...prev, saved].sort((a, b) => a.id - b.id);
        }
        return prev.map((gateway) => (gateway.id === saved.id ? saved : gateway));
      });
      setCalibrationState('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save calibration';
      setCalibrationError(message);
      setCalibrationState('error');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <Card>
        <CardHeader className="flex flex-col gap-2">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-2xl font-semibold">Positional Tracking Debug</div>
            <Chip color={connectionStatus === 'open' ? 'success' : 'warning'} variant="flat">
              {connectionStatus}
            </Chip>
          </div>
          <div className="text-sm text-foreground-500">
            {lastEventAt ? `Last event ${lastEventAt}` : 'Waiting for first event'}
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="text-lg font-semibold">Map</CardHeader>
          <CardBody>
            {plotData ? (
              <MapContainer
                className="h-[400px] w-full rounded-md border border-default-200 bg-default-50"
                crs={CRS.Simple}
                zoom={0}
                minZoom={-5}
                center={[0, 0]}
              >
                <MapBoundsUpdater
                  bounds={[
                    [plotData.minY, plotData.minX],
                    [plotData.minY + plotData.rangeY, plotData.minX + plotData.rangeX],
                  ]}
                />
                <Pane name="gateways" style={{ zIndex: 400 }}>
                  {gateways.map((gateway) => {
                    if (gateway.coordinates.x === null || gateway.coordinates.y === null) {
                      return null;
                    }
                    return (
                      <CircleMarker
                        key={`gateway-${gateway.id}`}
                        center={[gateway.coordinates.y, gateway.coordinates.x]}
                        radius={6}
                        pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.9 }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">{gateway.identifier}</div>
                            <div>
                              ({formatNumber(gateway.coordinates.x)}, {formatNumber(gateway.coordinates.y)})
                            </div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </Pane>
                <Pane name="beacons" style={{ zIndex: 500 }}>
                  {positions.map((pos) => (
                    <CircleMarker
                      key={`pos-${pos.identifier}`}
                      center={[pos.position.y, pos.position.x]}
                      radius={5}
                      pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9 }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold">{pos.identifier}</div>
                          <div>
                            ({formatNumber(pos.position.x)}, {formatNumber(pos.position.y)})
                          </div>
                          <div>Residual {formatNumber(pos.position.residual, 4)}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </Pane>
              </MapContainer>
            ) : (
              <div className="text-sm text-foreground-500">Waiting for gateway coordinates or positions.</div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="text-lg font-semibold">Gateways</CardHeader>
          <CardBody>
            <Table aria-label="Gateways">
              <TableHeader>
                <TableColumn>ID</TableColumn>
                <TableColumn>Identifier</TableColumn>
                <TableColumn>X</TableColumn>
                <TableColumn>Y</TableColumn>
                <TableColumn>TxPower</TableColumn>
                <TableColumn>PathLoss</TableColumn>
                <TableColumn>Calibrated</TableColumn>
              </TableHeader>
              <TableBody
                items={gateways}
                emptyContent="No gateways seen yet."
              >
                {(gateway) => (
                  <TableRow key={gateway.id}>
                    <TableCell>{gateway.id}</TableCell>
                    <TableCell>{gateway.identifier}</TableCell>
                    <TableCell>{formatNumber(gateway.coordinates.x)}</TableCell>
                    <TableCell>{formatNumber(gateway.coordinates.y)}</TableCell>
                    <TableCell>{formatNumber(gateway.calibration.txPowerAt1m)}</TableCell>
                    <TableCell>{formatNumber(gateway.calibration.pathLossExponent)}</TableCell>
                    <TableCell>
                      {gateway.calibration.calibrationUpdatedAt
                        ? formatRelativeSeconds(gateway.calibration.calibrationUpdatedAt, nowMs)
                        : '-'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="text-lg font-semibold">Calibration</CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Gateway"
              placeholder="Select gateway"
              selectedKeys={selectedGatewayId ? [String(selectedGatewayId)] : []}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                setSelectedGatewayId(value ? Number(value) : null);
              }}
              isDisabled={calibrationState === 'loading'}
            >
              {calibrationGateways.map((gateway) => (
                <SelectItem key={String(gateway.id)}>{gateway.identifier}</SelectItem>
              ))}
            </Select>

            <Select
              label="Beacon"
              placeholder="Select beacon"
              selectedKeys={selectedBeaconIdentifier ? [selectedBeaconIdentifier] : []}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                setSelectedBeaconIdentifier(value ?? null);
              }}
              isDisabled={Object.keys(beacons).length === 0}
            >
              {Object.keys(beacons).map((identifier) => (
                <SelectItem key={identifier}>{identifier}</SelectItem>
              ))}
            </Select>

            <div className="flex items-end gap-2">
              <Input
                label="Distance (m)"
                type="number"
                min={0}
                value={distanceInput}
                onChange={(event) => setDistanceInput(event.target.value)}
              />
              <Button onPress={addDistanceRow} isDisabled={!distanceInput}>
                Add
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground-500">
            <div>
              {activeDistance !== null
                ? `Sampling ${activeDistance}m (filtered RSSI when available)`
                : 'Not sampling - pick a distance to start'}
            </div>
            <div>
              {calibrationState === 'loading' && 'Loading gateways...'}
              {calibrationState === 'saving' && 'Saving calibration...'}
            </div>
          </div>

          {calibrationError && <div className="text-sm text-danger-500">{calibrationError}</div>}

          <Table aria-label="Calibration samples">
            <TableHeader>
              <TableColumn>Distance (m)</TableColumn>
              <TableColumn>Samples</TableColumn>
              <TableColumn>Mean RSSI</TableColumn>
              <TableColumn>StdDev</TableColumn>
              <TableColumn>Last Sample</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody items={calibrationStats} emptyContent="Add a distance to start sampling.">
              {(row) => (
                <TableRow key={row.distance}>
                  <TableCell>{formatNumber(row.distance, 2)}</TableCell>
                  <TableCell>{row.sampleCount}</TableCell>
                  <TableCell>{formatNumber(row.mean)}</TableCell>
                  <TableCell>{formatNumber(row.stddev)}</TableCell>
                  <TableCell>{row.lastSampleAt ? formatRelativeSeconds(row.lastSampleAt, nowMs) : '-'}</TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      color={activeDistance === row.distance ? 'success' : 'primary'}
                      variant={activeDistance === row.distance ? 'solid' : 'flat'}
                      onPress={() => toggleSampling(row.distance)}
                      isDisabled={selectedGatewayId === null || selectedBeaconIdentifier === null}
                    >
                      {activeDistance === row.distance ? 'Stop' : 'Start'}
                    </Button>
                    <Button size="sm" variant="light" onPress={() => clearSamples(row.distance)}>
                      Clear
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-foreground-500">
              {regressionResult
                ? `TxPower ${formatNumber(regressionResult.txPowerAt1m)} dBm, n ${formatNumber(
                  regressionResult.pathLossExponent,
                )}, RMSE ${formatNumber(regressionResult.rmse, 3)}, R² ${formatNumber(regressionResult.r2, 3)}`
                : 'Collect samples at two or more distances to compute calibration.'}
            </div>
            <Button
              onPress={handleSaveCalibration}
              isDisabled={
                !regressionResult ||
                selectedGatewayId === null ||
                calibrationState === 'saving' ||
                calibrationState === 'loading'
              }
            >
              Save calibration
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-lg font-semibold">Beacons</CardHeader>
        <CardBody className="flex flex-col gap-6">
          {Object.entries(beacons).length === 0 && (
            <div className="text-sm text-foreground-500">Waiting for readings.</div>
          )}
          {Object.entries(beacons).map(([identifier, beacon]) => (
            <Card key={identifier} className="border" shadow="none">
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Beacon {identifier}</div>
                <div className="text-xs text-foreground-500">Last event {beacon.lastEventAt ?? '-'}</div>
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                {beacon.latestPosition ? (
                  <div className="text-sm text-foreground-700">
                    Position: ({formatNumber(beacon.latestPosition.x)}, {formatNumber(beacon.latestPosition.y)}) residual{' '}
                    {formatNumber(beacon.latestPosition.residual, 4)}
                  </div>
                ) : (
                  <div className="text-sm text-foreground-500">No position calculated yet.</div>
                )}

                <Table aria-label={`Readings for beacon ${identifier}`}>
                  <TableHeader>
                    <TableColumn>Gateway</TableColumn>
                    <TableColumn>RSSI</TableColumn>
                    <TableColumn>Filtered</TableColumn>
                    <TableColumn>Distance</TableColumn>
                    <TableColumn>Battery</TableColumn>
                    <TableColumn>Observed</TableColumn>
                  </TableHeader>
                  <TableBody
                    items={beacon.latestReadings}
                    emptyContent="No readings in window."
                  >
                    {(reading) => (
                      <TableRow key={`${identifier}-${reading.gateway.id}`}>
                        <TableCell>{reading.gateway.identifier}</TableCell>
                        <TableCell>{formatNumber(reading.rssi)}</TableCell>
                        <TableCell>{formatNumber(reading.filteredRssi)}</TableCell>
                        <TableCell>{formatNumber(reading.distance)}</TableCell>
                        <TableCell>{formatNumber(reading.battery, 0)}</TableCell>
                        <TableCell>{formatRelativeSeconds(reading.observedAt, nowMs)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardBody>
            </Card>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
