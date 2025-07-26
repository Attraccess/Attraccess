/**
 * Web Serial API type definitions
 * Based on the Web Serial API specification
 */

declare global {
  interface Navigator {
    serial: Serial;
  }

  interface Serial extends EventTarget {
    getPorts(): Promise<SerialPort[]>;
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    addEventListener(
      type: 'connect' | 'disconnect',
      listener: (event: SerialConnectionEvent) => void
    ): void;
    removeEventListener(
      type: 'connect' | 'disconnect',
      listener: (event: SerialConnectionEvent) => void
    ): void;
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
  }

  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialConnectionEvent extends Event {
    port: SerialPort;
  }

  interface SerialPort extends EventTarget {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    forget(): Promise<void>;
    getInfo(): SerialPortInfo;
    getSignals(): Promise<SerialOutputSignals>;
    setSignals(signals: SerialInputSignals): Promise<void>;
    
    addEventListener(
      type: 'connect' | 'disconnect',
      listener: (event: Event) => void
    ): void;
    removeEventListener(
      type: 'connect' | 'disconnect',
      listener: (event: Event) => void
    ): void;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }

  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
    serialNumber?: string;
  }

  interface SerialOutputSignals {
    dataCarrierDetect: boolean;
    clearToSend: boolean;
    ringIndicator: boolean;
    dataSetReady: boolean;
  }

  interface SerialInputSignals {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
  }
}

export {};