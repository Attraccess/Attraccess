import { type Snapshot } from '../runtime/types';

export type LogicalChannel = Snapshot['logicalChannels'][number];

export type PhysicalPoint = Snapshot['physicalPoints'][number];

import { type PulseRoute } from '../runtime/types';

export type Pulse = PulseRoute & { timer: ReturnType<typeof setTimeout>; write: (value: boolean) => Promise<void> };
