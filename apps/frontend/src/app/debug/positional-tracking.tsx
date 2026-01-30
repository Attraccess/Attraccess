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
import { CircleMarker, MapContainer, Pane, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BeaconType,
  BleGatewayType,
  PositionalBeaconResponseDto,
  PositionalGatewayResponseDto,
  UsePositionalTrackingServiceGetPositionalTrackingBeaconsKeyFn,
  UsePositionalTrackingServiceGetPositionalTrackingGatewaysKeyFn,
  usePositionalTrackingServiceCreatePositionalTrackingBeacon,
  usePositionalTrackingServiceCreatePositionalTrackingGateway,
  usePositionalTrackingServiceDeletePositionalTrackingBeacon,
  usePositionalTrackingServiceDeletePositionalTrackingGateway,
  usePositionalTrackingServiceGetPositionalTrackingBeacons,
  usePositionalTrackingServiceGetPositionalTrackingGateways,
  usePositionalTrackingServiceUpdatePositionalTrackingBeacon,
  usePositionalTrackingServiceUpdatePositionalTrackingGateway,
  usePositionalTrackingServiceUpdatePositionalTrackingGatewayCalibration,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalibrationSample,
  CalibrationRegressionResult,
  computeCalibrationRegression,
} from './positional-tracking.calibration';

type DebugGateway = PositionalGatewayResponseDto;

type ManagedBeacon = PositionalBeaconResponseDto;

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

function mergeLatestReadings(previous: DebugReading[], incoming: DebugReading[]) {
  const merged = new Map<number, DebugReading>();
  previous.forEach((reading) => merged.set(reading.gateway.id, reading));
  incoming.forEach((reading) => {
    const existing = merged.get(reading.gateway.id);
    if (!existing) {
      merged.set(reading.gateway.id, reading);
      return;
    }
    const existingTime = Date.parse(existing.observedAt);
    const nextTime = Date.parse(reading.observedAt);
    if (Number.isNaN(existingTime) || Number.isNaN(nextTime) || nextTime >= existingTime) {
      merged.set(reading.gateway.id, reading);
    }
  });
  return [...merged.values()].sort((a, b) => a.gateway.identifier.localeCompare(b.gateway.identifier));
}

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

type GatewayFormState = {
  identifier: string;
  type: DebugGateway['type'];
  mqttServerId: string;
  topic: string;
  subscribeQos: string;
  x: string;
  y: string;
};

type DistanceConnection = {
  key: string;
  beaconIdentifier: string;
  gatewayIdentifier: string;
  beaconCoordinates: { x: number; y: number };
  gatewayCoordinates: { x: number; y: number };
  distance: number;
};

const gatewayTypeOptions: DebugGateway['type'][] = [BleGatewayType.GLS10, BleGatewayType.SHELLY];
const beaconTypeOptions: ManagedBeacon['type'][] = [BeaconType.HOLYIOT];

const emptySamplingState: CalibrationSamplingState = {
  gatewayId: null,
  beaconIdentifier: null,
  activeDistance: null,
};

function formatRelativeSeconds(isoTimestamp: string, nowMs: number) {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return '-';
  }
  const diffSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  return diffSeconds === 1 ? '1 second ago' : `${diffSeconds} seconds ago`;
}

function buildGatewayForm(gateway: DebugGateway): GatewayFormState {
  return {
    identifier: gateway.identifier,
    type: gateway.type,
    mqttServerId: gateway.mqttServerId ? String(gateway.mqttServerId) : '',
    topic: gateway.topic ?? '',
    subscribeQos: gateway.subscribeQos !== null && gateway.subscribeQos !== undefined ? String(gateway.subscribeQos) : '',
    x: gateway.coordinates.x !== null && gateway.coordinates.x !== undefined ? String(gateway.coordinates.x) : '',
    y: gateway.coordinates.y !== null && gateway.coordinates.y !== undefined ? String(gateway.coordinates.y) : '',
  };
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function MapBoundsUpdater({
  bounds,
  gatewayIds,
}: {
  bounds: LatLngBoundsExpression;
  gatewayIds: number[];
}) {
  const map = useMap();
  const previousGatewayIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    const previousIds = previousGatewayIds.current;
    const nextIds = new Set(gatewayIds);
    let hasNewGateway = false;
    nextIds.forEach((id) => {
      if (!previousIds.has(id)) {
        hasNewGateway = true;
      }
    });
    if (hasNewGateway) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
    previousGatewayIds.current = nextIds;
  }, [map, bounds, gatewayIds]);

  return null;
}

export function PositionalTrackingDebugPage() {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'open'>('connecting');
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [beacons, setBeacons] = useState<Record<string, BeaconState>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [selectedGatewayId, setSelectedGatewayId] = useState<number | null>(null);
  const [selectedBeaconIdentifier, setSelectedBeaconIdentifier] = useState<string | null>(null);
  const [distanceInput, setDistanceInput] = useState('');
  const [calibrationRows, setCalibrationRows] = useState<CalibrationRow[]>([]);
  const [activeDistance, setActiveDistance] = useState<number | null>(null);
  const samplingRef = useRef<CalibrationSamplingState>(emptySamplingState);
  const [gatewayForms, setGatewayForms] = useState<Record<number, GatewayFormState>>({});
  const [newGatewayForm, setNewGatewayForm] = useState<GatewayFormState>({
    identifier: '',
    type: BleGatewayType.GLS10,
    mqttServerId: '',
    topic: '',
    subscribeQos: '',
    x: '',
    y: '',
  });
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [beaconForms, setBeaconForms] = useState<Record<string, ManagedBeacon['type']>>({});
  const [newBeaconIdentifier, setNewBeaconIdentifier] = useState('');
  const [newBeaconType, setNewBeaconType] = useState<ManagedBeacon['type']>(BeaconType.HOLYIOT);
  const [beaconError, setBeaconError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const {
    data: calibrationGateways = [],
    status: gatewaysStatus,
    error: gatewaysError,
  } = usePositionalTrackingServiceGetPositionalTrackingGateways();
  const {
    data: managedBeacons = [],
    status: beaconsStatus,
    error: beaconsError,
  } = usePositionalTrackingServiceGetPositionalTrackingBeacons();
  const createGatewayMutation = usePositionalTrackingServiceCreatePositionalTrackingGateway({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UsePositionalTrackingServiceGetPositionalTrackingGatewaysKeyFn()[0]],
      });
    },
  });
  const updateGatewayMutation = usePositionalTrackingServiceUpdatePositionalTrackingGateway({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UsePositionalTrackingServiceGetPositionalTrackingGatewaysKeyFn()[0]],
      });
    },
  });
  const deleteGatewayMutation = usePositionalTrackingServiceDeletePositionalTrackingGateway({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UsePositionalTrackingServiceGetPositionalTrackingGatewaysKeyFn()[0]],
      });
    },
  });
  const updateCalibrationMutation = usePositionalTrackingServiceUpdatePositionalTrackingGatewayCalibration({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UsePositionalTrackingServiceGetPositionalTrackingGatewaysKeyFn()[0]],
      });
    },
  });
  const createBeaconMutation = usePositionalTrackingServiceCreatePositionalTrackingBeacon({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UsePositionalTrackingServiceGetPositionalTrackingBeaconsKeyFn()[0]],
      });
    },
  });
  const updateBeaconMutation = usePositionalTrackingServiceUpdatePositionalTrackingBeacon({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UsePositionalTrackingServiceGetPositionalTrackingBeaconsKeyFn()[0]],
      });
    },
  });
  const deleteBeaconMutation = usePositionalTrackingServiceDeletePositionalTrackingBeacon({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UsePositionalTrackingServiceGetPositionalTrackingBeaconsKeyFn()[0]],
      });
    },
  });

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

  useEffect(() => {
    if (selectedGatewayId === null && calibrationGateways.length > 0) {
      setSelectedGatewayId(calibrationGateways[0].id);
    }
  }, [selectedGatewayId, calibrationGateways]);

  useEffect(() => {
    setGatewayForms(Object.fromEntries(calibrationGateways.map((gateway) => [gateway.id, buildGatewayForm(gateway)])));
  }, [calibrationGateways]);

  useEffect(() => {
    setBeaconForms(Object.fromEntries(managedBeacons.map((beacon) => [beacon.identifier, beacon.type])));
  }, [managedBeacons]);

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
        const mergedReadings = mergeLatestReadings(current.latestReadings, parsed.latestReadings);
        return {
          ...prev,
          [parsed.beaconIdentifier]: {
            latestReadings: mergedReadings,
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

  const gatewayIdsWithCoordinates = useMemo(() => {
    return gateways
      .filter((gateway) => typeof gateway.coordinates.x === 'number' && typeof gateway.coordinates.y === 'number')
      .map((gateway) => gateway.id)
      .sort((a, b) => a - b);
  }, [gateways]);

  const distanceConnections = useMemo<DistanceConnection[]>(() => {
    const connections: DistanceConnection[] = [];
    Object.entries(beacons).forEach(([identifier, beacon]) => {
      const position = beacon.latestPosition;
      if (!position) {
        return;
      }
      beacon.latestReadings.forEach((reading) => {
        const { x, y } = reading.gateway.coordinates;
        if (typeof x !== 'number' || typeof y !== 'number') {
          return;
        }
        const distance = reading.distance;
        if (distance === null || !Number.isFinite(distance)) {
          return;
        }
        connections.push({
          key: `${identifier}-${reading.gateway.id}`,
          beaconIdentifier: identifier,
          gatewayIdentifier: reading.gateway.identifier,
          beaconCoordinates: { x: position.x, y: position.y },
          gatewayCoordinates: { x, y },
          distance,
        });
      });
    });
    return connections;
  }, [beacons]);

  const plotData = useMemo(() => {
    const points: Array<{ x: number; y: number }> = [];
    gateways.forEach((gateway) => {
      const { x, y } = gateway.coordinates;
      if (typeof x === 'number' && typeof y === 'number') {
        points.push({ x, y });
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
    setCalibrationError(null);
    try {
      await updateCalibrationMutation.mutateAsync({
        id: selectedGatewayId,
        requestBody: {
          txPowerAt1m: regressionResult.txPowerAt1m,
          pathLossExponent: regressionResult.pathLossExponent,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save calibration';
      setCalibrationError(message);
    }
  };

  const handleGatewayFormChange = (gatewayId: number, field: keyof GatewayFormState, value: string) => {
    setGatewayForms((prev) => ({
      ...prev,
      [gatewayId]: {
        ...prev[gatewayId],
        [field]: value,
      },
    }));
  };

  const handleCreateGateway = async () => {
    if (!newGatewayForm.identifier.trim()) {
      setGatewayError('Gateway identifier is required');
      return;
    }
    const mqttServerId = Number(newGatewayForm.mqttServerId);
    if (!Number.isFinite(mqttServerId)) {
      setGatewayError('MQTT server ID must be a number');
      return;
    }
    setGatewayError(null);
    try {
      await createGatewayMutation.mutateAsync({
        requestBody: {
          identifier: newGatewayForm.identifier.trim(),
          type: newGatewayForm.type,
          mqttServerId,
          topic: newGatewayForm.topic.trim() || undefined,
          subscribeQos: parseOptionalNumber(newGatewayForm.subscribeQos),
          coordinates: {
            x: parseOptionalNumber(newGatewayForm.x),
            y: parseOptionalNumber(newGatewayForm.y),
          },
        },
      });
      setNewGatewayForm({
        identifier: '',
        type: BleGatewayType.GLS10,
        mqttServerId: '',
        topic: '',
        subscribeQos: '',
        x: '',
        y: '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create gateway';
      setGatewayError(message);
    }
  };

  const handleSaveGateway = async (gatewayId: number) => {
    const form = gatewayForms[gatewayId];
    if (!form) {
      return;
    }
    if (!form.identifier.trim()) {
      setGatewayError('Gateway identifier is required');
      return;
    }
    const mqttServerId = Number(form.mqttServerId);
    if (!Number.isFinite(mqttServerId)) {
      setGatewayError('MQTT server ID must be a number');
      return;
    }
    setGatewayError(null);
    try {
      await updateGatewayMutation.mutateAsync({
        id: gatewayId,
        requestBody: {
          identifier: form.identifier.trim(),
          type: form.type,
          mqttServerId,
          topic: form.topic.trim() || undefined,
          subscribeQos: parseOptionalNumber(form.subscribeQos),
          coordinates: {
            x: parseOptionalNumber(form.x),
            y: parseOptionalNumber(form.y),
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update gateway';
      setGatewayError(message);
    }
  };

  const handleDeleteGateway = async (gatewayId: number) => {
    setGatewayError(null);
    try {
      await deleteGatewayMutation.mutateAsync({ id: gatewayId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete gateway';
      setGatewayError(message);
    }
  };

  const handleBeaconTypeChange = (identifier: string, value: ManagedBeacon['type']) => {
    setBeaconForms((prev) => ({ ...prev, [identifier]: value }));
  };

  const handleCreateBeacon = async () => {
    if (!newBeaconIdentifier.trim()) {
      setBeaconError('Beacon identifier is required');
      return;
    }
    setBeaconError(null);
    try {
      await createBeaconMutation.mutateAsync({
        requestBody: {
          identifier: newBeaconIdentifier.trim(),
          type: newBeaconType,
        },
      });
      setNewBeaconIdentifier('');
      setNewBeaconType(BeaconType.HOLYIOT);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create beacon';
      setBeaconError(message);
    }
  };

  const handleSaveBeacon = async (identifier: string) => {
    const type = beaconForms[identifier];
    if (!type) {
      return;
    }
    setBeaconError(null);
    try {
      await updateBeaconMutation.mutateAsync({
        identifier,
        requestBody: { type },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update beacon';
      setBeaconError(message);
    }
  };

  const handleDeleteBeacon = async (identifier: string) => {
    setBeaconError(null);
    try {
      await deleteBeaconMutation.mutateAsync({ identifier });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete beacon';
      setBeaconError(message);
    }
  };

  const isGatewayMutationPending =
    createGatewayMutation.isPending || updateGatewayMutation.isPending || deleteGatewayMutation.isPending;
  const isBeaconMutationPending =
    createBeaconMutation.isPending || updateBeaconMutation.isPending || deleteBeaconMutation.isPending;
  const isCalibrationSaving = updateCalibrationMutation.isPending;
  const gatewaysErrorMessage = gatewaysError instanceof Error ? gatewaysError.message : null;
  const beaconsErrorMessage = beaconsError instanceof Error ? beaconsError.message : null;

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
                gatewayIds={gatewayIdsWithCoordinates}
              />
              <Pane name="gateways" style={{ zIndex: 400 }}>
                {gateways.map((gateway) => {
                  const { x, y } = gateway.coordinates;
                  if (typeof x !== 'number' || typeof y !== 'number') {
                    return null;
                  }
                  return (
                    <CircleMarker
                      key={`gateway-${gateway.id}`}
                      center={[y, x]}
                      radius={6}
                      pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.9 }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold">{gateway.identifier}</div>
                          <div>
                            ({formatNumber(x)}, {formatNumber(y)})
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </Pane>
              <Pane name="distances" style={{ zIndex: 450 }}>
                {distanceConnections.map((connection) => (
                  <Polyline
                    key={connection.key}
                    positions={[
                      [connection.beaconCoordinates.y, connection.beaconCoordinates.x],
                      [connection.gatewayCoordinates.y, connection.gatewayCoordinates.x],
                    ]}
                    pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '4 6' }}
                  >
                    <Tooltip direction="center" permanent>
                      {`${formatNumber(connection.distance)} m`}
                    </Tooltip>
                  </Polyline>
                ))}
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
                  <TableBody items={beacon.latestReadings} emptyContent="No readings in window.">
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

      <Card>
        <CardHeader className="text-lg font-semibold">Manage Beacons</CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              label="Identifier"
              value={newBeaconIdentifier}
              onChange={(event) => setNewBeaconIdentifier(event.target.value)}
            />
            <Select
              label="Type"
              selectedKeys={[newBeaconType]}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as ManagedBeacon['type'][];
                setNewBeaconType(value ?? BeaconType.HOLYIOT);
              }}
            >
              {beaconTypeOptions.map((type) => (
                <SelectItem key={type}>{type}</SelectItem>
              ))}
            </Select>
            <div className="flex items-end">
              <Button onPress={handleCreateBeacon} isDisabled={isBeaconMutationPending}>
                Add beacon
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground-500">
            <div>
              {beaconsStatus === 'pending' && 'Loading beacons...'}
              {isBeaconMutationPending && 'Saving beacon changes...'}
            </div>
          </div>
          {(beaconError || beaconsErrorMessage) && (
            <div className="text-sm text-danger-500">{beaconError ?? beaconsErrorMessage}</div>
          )}
          <Table aria-label="Manage beacons">
            <TableHeader>
              <TableColumn>Identifier</TableColumn>
              <TableColumn>Type</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody items={managedBeacons} emptyContent="No beacons configured.">
              {(beacon) => {
                const type = beaconForms[beacon.identifier] ?? beacon.type;
                return (
                  <TableRow key={`manage-${beacon.identifier}`}>
                    <TableCell>{beacon.identifier}</TableCell>
                    <TableCell>
                      <Select
                        aria-label={`Type for beacon ${beacon.identifier}`}
                        selectedKeys={[type]}
                        onSelectionChange={(keys) => {
                          const [value] = Array.from(keys) as ManagedBeacon['type'][];
                          handleBeaconTypeChange(beacon.identifier, value ?? BeaconType.HOLYIOT);
                        }}
                      >
                        {beaconTypeOptions.map((option) => (
                          <SelectItem key={option}>{option}</SelectItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onPress={() => handleSaveBeacon(beacon.identifier)}
                        isDisabled={isBeaconMutationPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        variant="light"
                        onPress={() => handleDeleteBeacon(beacon.identifier)}
                        isDisabled={isBeaconMutationPending}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-lg font-semibold">Manage Gateways</CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-7">
            <Input
              label="Identifier"
              value={newGatewayForm.identifier}
              onChange={(event) => setNewGatewayForm((prev) => ({ ...prev, identifier: event.target.value }))}
            />
            <Select
              label="Type"
              selectedKeys={[newGatewayForm.type]}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as DebugGateway['type'][];
                setNewGatewayForm((prev) => ({ ...prev, type: value ?? BleGatewayType.GLS10 }));
              }}
            >
              {gatewayTypeOptions.map((type) => (
                <SelectItem key={type}>{type}</SelectItem>
              ))}
            </Select>
            <Input
              label="MQTT server ID"
              type="number"
              min={0}
              value={newGatewayForm.mqttServerId}
              onChange={(event) => setNewGatewayForm((prev) => ({ ...prev, mqttServerId: event.target.value }))}
            />
            <Input
              label="Topic"
              value={newGatewayForm.topic}
              onChange={(event) => setNewGatewayForm((prev) => ({ ...prev, topic: event.target.value }))}
            />
            <Input
              label="QoS"
              type="number"
              min={0}
              value={newGatewayForm.subscribeQos}
              onChange={(event) => setNewGatewayForm((prev) => ({ ...prev, subscribeQos: event.target.value }))}
            />
            <Input
              label="X"
              type="number"
              value={newGatewayForm.x}
              onChange={(event) => setNewGatewayForm((prev) => ({ ...prev, x: event.target.value }))}
            />
            <Input
              label="Y"
              type="number"
              value={newGatewayForm.y}
              onChange={(event) => setNewGatewayForm((prev) => ({ ...prev, y: event.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-foreground-500">
              {gatewaysStatus === 'pending' && 'Loading gateways...'}
              {isGatewayMutationPending && 'Saving gateway changes...'}
            </div>
            <Button onPress={handleCreateGateway} isDisabled={isGatewayMutationPending}>
              Add gateway
            </Button>
          </div>
          {(gatewayError || gatewaysErrorMessage) && (
            <div className="text-sm text-danger-500">{gatewayError ?? gatewaysErrorMessage}</div>
          )}
          {calibrationGateways.length === 0 ? (
            <div className="text-sm text-foreground-500">No gateways configured.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {calibrationGateways.map((gateway) => {
                const form = gatewayForms[gateway.id] ?? buildGatewayForm(gateway);
                return (
                  <Card key={`manage-${gateway.id}`} className="border" shadow="none">
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Gateway {gateway.id}</div>
                      <div className="text-xs text-foreground-500">{gateway.identifier}</div>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="Identifier"
                          value={form.identifier}
                          onChange={(event) => handleGatewayFormChange(gateway.id, 'identifier', event.target.value)}
                        />
                        <Select
                          label="Type"
                          selectedKeys={[form.type]}
                          onSelectionChange={(keys) => {
                            const [value] = Array.from(keys) as DebugGateway['type'][];
                            handleGatewayFormChange(gateway.id, 'type', value ?? BleGatewayType.GLS10);
                          }}
                        >
                          {gatewayTypeOptions.map((type) => (
                            <SelectItem key={type}>{type}</SelectItem>
                          ))}
                        </Select>
                        <Input
                          label="MQTT server ID"
                          type="number"
                          min={0}
                          value={form.mqttServerId}
                          onChange={(event) => handleGatewayFormChange(gateway.id, 'mqttServerId', event.target.value)}
                        />
                        <Input
                          label="Topic"
                          value={form.topic}
                          onChange={(event) => handleGatewayFormChange(gateway.id, 'topic', event.target.value)}
                        />
                        <Input
                          label="QoS"
                          type="number"
                          min={0}
                          value={form.subscribeQos}
                          onChange={(event) => handleGatewayFormChange(gateway.id, 'subscribeQos', event.target.value)}
                        />
                        <Input
                          label="X"
                          type="number"
                          value={form.x}
                          onChange={(event) => handleGatewayFormChange(gateway.id, 'x', event.target.value)}
                        />
                        <Input
                          label="Y"
                          type="number"
                          value={form.y}
                          onChange={(event) => handleGatewayFormChange(gateway.id, 'y', event.target.value)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onPress={() => handleSaveGateway(gateway.id)} isDisabled={isGatewayMutationPending}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          color="danger"
                          variant="light"
                          onPress={() => handleDeleteGateway(gateway.id)}
                          isDisabled={isGatewayMutationPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

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
              isDisabled={gatewaysStatus === 'pending'}
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
              {gatewaysStatus === 'pending' && 'Loading gateways...'}
              {isCalibrationSaving && 'Saving calibration...'}
            </div>
          </div>

          {(calibrationError || gatewaysErrorMessage) && (
            <div className="text-sm text-danger-500">{calibrationError ?? gatewaysErrorMessage}</div>
          )}

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
                isCalibrationSaving ||
                gatewaysStatus === 'pending'
              }
            >
              Save calibration
            </Button>
          </div>
        </CardBody>
      </Card>


    </div>
  );
}
