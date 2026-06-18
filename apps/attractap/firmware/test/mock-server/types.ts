/** Wire format the device sends: { event: "EVENT", data: { type, payload } } */
export interface DeviceEvent {
  event: 'EVENT' | 'HEARTBEAT';
  data?: {
    type: string;
    payload?: Record<string, unknown>;
  };
}

/** Wire format the server sends toward the device */
export interface ServerEvent {
  event: 'EVENT';
  data: {
    type: string;
    payload?: Record<string, unknown>;
  };
}

export interface MessageMatcher {
  type: string;
  resolve: (payload: Record<string, unknown> | undefined) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
