# WebSerial ESP Device Management in React TypeScript

This guide explains how to implement WebSerial-based ESP device management features in a React TypeScript application, including flashing firmware, WiFi configuration, console access, and device control.

## Prerequisites

- **Browser Support**: Chrome/Edge (WebSerial API support required)
- **HTTPS**: WebSerial API only works over HTTPS
- **TypeScript**: For type safety
- **React**: 18+ recommended

## Required Libraries

```bash
npm install esptool-js improv-wifi-serial-sdk
npm install -D @types/w3c-web-serial
```

### Library Overview

- **`esptool-js`** (v0.5.3+): JavaScript port of esptool for flashing ESP devices
- **`improv-wifi-serial-sdk`** (v2.5.0+): WiFi provisioning over serial using Improv protocol
- **`@types/w3c-web-serial`**: TypeScript definitions for WebSerial API

## Basic Setup

### 1. WebSerial Types

Create a types file for WebSerial support:

```typescript
// types/webserial.d.ts
interface Navigator {
  serial: Serial;
}

interface Serial {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}
```

### 2. WebSerial Utility Hook

```typescript
// hooks/useWebSerial.ts
import { useState, useCallback } from 'react';

export const useWebSerial = () => {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const checkWebSerialSupport = useCallback(() => {
    return 'serial' in navigator;
  }, []);

  const requestPort = useCallback(async (filters?: SerialPortFilter[]) => {
    if (!checkWebSerialSupport()) {
      throw new Error('WebSerial not supported');
    }

    try {
      const selectedPort = await navigator.serial.requestPort({ filters });
      await selectedPort.open({ baudRate: 115200, bufferSize: 8192 });
      
      selectedPort.addEventListener('disconnect', () => {
        setPort(null);
        setIsConnected(false);
      });

      setPort(selectedPort);
      setIsConnected(true);
      return selectedPort;
    } catch (error) {
      console.error('Error requesting port:', error);
      throw error;
    }
  }, [checkWebSerialSupport]);

  const disconnectPort = useCallback(async () => {
    if (port) {
      await port.close();
      setPort(null);
      setIsConnected(false);
    }
  }, [port]);

  return {
    port,
    isConnected,
    checkWebSerialSupport,
    requestPort,
    disconnectPort
  };
};
```

## Feature Implementation

### 1. Flash Binary File from URL

```typescript
// components/FlashDevice.tsx
import React, { useState } from 'react';
import { ESPLoader, Transport } from 'esptool-js';

interface FileToFlash {
  data: string;
  address: number;
}

const FlashDevice: React.FC<{ port: SerialPort }> = ({ port }) => {
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const downloadBinary = async (url: string): Promise<FileToFlash> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const reader = new FileReader();
      
      return new Promise((resolve) => {
        reader.onload = () => {
          resolve({
            data: reader.result as string,
            address: 0
          });
        };
        reader.readAsBinaryString(blob);
      });
    } catch (err) {
      throw new Error(`Failed to download binary: ${err}`);
    }
  };

  const flashDevice = async (firmwareUrl: string, erase: boolean = true) => {
    if (!port) return;

    setIsFlashing(true);
    setProgress(0);
    setError(null);

    try {
      // Create ESPLoader instance
      const transport = new Transport(port);
      const esploader = new ESPLoader({
        transport,
        baudrate: 115200,
        romBaudrate: 115200,
        enableTracing: false
      });

      // Initialize connection
      await esploader.main();
      await esploader.flashId();

      // Download firmware
      const fileToFlash = await downloadBinary(firmwareUrl);
      const fileArray = [fileToFlash];

      // Erase if requested
      if (erase) {
        await esploader.eraseFlash();
      }

      // Calculate total size for progress
      const totalSize = fileArray.reduce((sum, file) => sum + file.data.length, 0);
      let totalWritten = 0;

      // Flash the firmware
      await esploader.writeFlash({
        fileArray,
        flashSize: 'keep',
        flashMode: 'keep',
        flashFreq: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex: number, written: number, total: number) => {
          const uncompressedWritten = (written / total) * fileArray[fileIndex].data.length;
          const newProgress = Math.floor(((totalWritten + uncompressedWritten) / totalSize) * 100);
          
          if (written === total) {
            totalWritten += uncompressedWritten;
          }
          
          setProgress(newProgress);
        }
      });

      setProgress(100);
      console.log('Flashing completed successfully');
    } catch (err) {
      setError(`Flashing failed: ${err}`);
      console.error('Flashing error:', err);
    } finally {
      setIsFlashing(false);
    }
  };

  return (
    <div className="flash-device">
      <h3>Flash Device</h3>
      
      <button 
        onClick={() => flashDevice('https://firmware.esphome.io/esphome-web/latest/esphome-web-esp32.factory.bin')}
        disabled={isFlashing || !port}
      >
        {isFlashing ? 'Flashing...' : 'Flash ESPHome Firmware'}
      </button>

      {isFlashing && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
          <span>{progress}%</span>
        </div>
      )}

      {error && (
        <div className="error">
          {error}
        </div>
      )}
    </div>
  );
};
```

### 2. Configure WiFi via Improv

```typescript
// components/WiFiConfig.tsx
import React, { useEffect, useState } from 'react';

const WiFiConfig: React.FC<{ port: SerialPort }> = ({ port }) => {
  const [isConfiguring, setIsConfiguring] = useState(false);

  const configureWiFi = async () => {
    if (!port) return;

    setIsConfiguring(true);

    try {
      // Dynamically import the Improv WiFi Serial SDK
      await import('improv-wifi-serial-sdk/dist/serial-provision-dialog');
      
      // Create the improv dialog element
      const improvDialog = document.createElement('improv-wifi-serial-provision-dialog') as any;
      improvDialog.port = port;
      
      // Add event listeners
      improvDialog.addEventListener('closed', (event: any) => {
        setIsConfiguring(false);
        if (event.detail.improv) {
          console.log('WiFi configuration successful');
        } else {
          console.log('WiFi configuration cancelled');
        }
        // Clean up
        document.body.removeChild(improvDialog);
      });

      // Add to DOM to trigger the dialog
      document.body.appendChild(improvDialog);

    } catch (error) {
      console.error('WiFi configuration error:', error);
      setIsConfiguring(false);
    }
  };

  return (
    <div className="wifi-config">
      <h3>WiFi Configuration</h3>
      
      <button 
        onClick={configureWiFi}
        disabled={isConfiguring || !port}
      >
        {isConfiguring ? 'Configuring...' : 'Configure WiFi'}
      </button>

      <p>
        Click to configure WiFi credentials using the Improv protocol.
        The device will scan for networks and allow you to select and enter credentials.
      </p>
    </div>
  );
};
```

### 3. Show Console Output

```typescript
// components/Console.tsx
import React, { useEffect, useRef, useState } from 'react';

interface ConsoleProps {
  port: SerialPort;
  allowInput?: boolean;
}

const Console: React.FC<ConsoleProps> = ({ port, allowInput = true }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const connectToConsole = async () => {
    if (!port || isConnected) return;

    // Create new abort controller for this connection
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setIsConnected(true);
      addLog('Console connected');

      // Set up readable stream processing
      const reader = port.readable!
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform(chunk, controller) {
            // Split by line breaks and process each line
            const lines = chunk.split('\n');
            lines.forEach(line => {
              if (line.trim()) {
                controller.enqueue(line.trim());
              }
            });
          }
        }))
        .getReader();

      // Read loop
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        
        addLog(value);
      }

    } catch (error) {
      if (!signal.aborted) {
        addLog(`Console error: ${error}`);
      }
    } finally {
      setIsConnected(false);
      addLog('Console disconnected');
    }
  };

  const disconnectFromConsole = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const sendCommand = async (command: string) => {
    if (!port || !isConnected) return;

    try {
      const writer = port.writable!.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(`${command}\r\n`));
      writer.releaseLock();
      
      addLog(`> ${command}`);
      setInputValue('');
    } catch (error) {
      addLog(`Send error: ${error}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand(inputValue);
    }
  };

  useEffect(() => {
    if (port) {
      connectToConsole();
    }

    return () => {
      disconnectFromConsole();
    };
  }, [port]);

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  return (
    <div className="console">
      <h3>Console Output</h3>
      
      <div className="console-output">
        {logs.map((log, index) => (
          <div key={index} className="log-line">
            {log}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {allowInput && (
        <div className="console-input">
          <span>{'>'}</span>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter command..."
            disabled={!isConnected}
          />
          <button 
            onClick={() => sendCommand(inputValue)}
            disabled={!isConnected || !inputValue.trim()}
          >
            Send
          </button>
        </div>
      )}

      <div className="console-controls">
        <button 
          onClick={connectToConsole}
          disabled={isConnected}
        >
          Connect
        </button>
        <button 
          onClick={disconnectFromConsole}
          disabled={!isConnected}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
};
```

### 4. Reset/Restart Device

```typescript
// components/DeviceControls.tsx
import React, { useState } from 'react';

const DeviceControls: React.FC<{ port: SerialPort }> = ({ port }) => {
  const [isResetting, setIsResetting] = useState(false);

  const resetDevice = async () => {
    if (!port) return;

    setIsResetting(true);

    try {
      // Reset sequence using DTR and RTS signals
      await port.setSignals({
        dataTerminalReady: false,
        requestToSend: true
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      await port.setSignals({
        dataTerminalReady: false,
        requestToSend: false
      });

      // Wait for reset to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Device reset completed');
    } catch (error) {
      console.error('Reset error:', error);
    } finally {
      setIsResetting(false);
    }
  };

  const softReset = async () => {
    if (!port) return;

    try {
      const writer = port.writable!.getWriter();
      const encoder = new TextEncoder();
      
      // Send Ctrl+C followed by soft reset command
      await writer.write(encoder.encode('\x03'));
      await writer.write(encoder.encode('\x04'));
      
      writer.releaseLock();
      console.log('Soft reset sent');
    } catch (error) {
      console.error('Soft reset error:', error);
    }
  };

  return (
    <div className="device-controls">
      <h3>Device Controls</h3>
      
      <button 
        onClick={resetDevice}
        disabled={isResetting || !port}
      >
        {isResetting ? 'Resetting...' : 'Hard Reset'}
      </button>

      <button 
        onClick={softReset}
        disabled={!port}
      >
        Soft Reset
      </button>

      <p>
        <strong>Hard Reset:</strong> Uses DTR/RTS signals to physically reset the device<br/>
        <strong>Soft Reset:</strong> Sends control characters to restart the firmware
      </p>
    </div>
  );
};
```

### 5. Get Device Firmware Information

```typescript
// components/DeviceInfo.tsx
import React, { useState, useEffect } from 'react';
import { ESPLoader, Transport } from 'esptool-js';

interface DeviceInfo {
  chipType: string;
  macAddress: string;
  flashSize: string;
  flashMode: string;
  flashFreq: string;
  features: string[];
}

const DeviceInfo: React.FC<{ port: SerialPort }> = ({ port }) => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDeviceInfo = async () => {
    if (!port) return;

    setIsLoading(true);
    setError(null);

    try {
      const transport = new Transport(port);
      const esploader = new ESPLoader({
        transport,
        baudrate: 115200,
        romBaudrate: 115200,
        enableTracing: false
      });

      // Connect and get chip info
      await esploader.main();
      const chipInfo = await esploader.flashId();
      
      // Get MAC address
      const macAddress = await esploader.readMac();
      
      // Get flash information
      const flashInfo = await esploader.getFlashWriteSize();

      setDeviceInfo({
        chipType: esploader.chip.CHIP_NAME,
        macAddress: macAddress,
        flashSize: `${flashInfo.flash_size} MB`,
        flashMode: flashInfo.flash_mode,
        flashFreq: `${flashInfo.flash_freq} MHz`,
        features: esploader.chip.get_chip_features ? esploader.chip.get_chip_features() : []
      });

    } catch (err) {
      setError(`Failed to get device info: ${err}`);
      console.error('Device info error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (port) {
      getDeviceInfo();
    }
  }, [port]);

  return (
    <div className="device-info">
      <h3>Device Information</h3>
      
      <button 
        onClick={getDeviceInfo}
        disabled={isLoading || !port}
      >
        {isLoading ? 'Reading...' : 'Refresh Info'}
      </button>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {deviceInfo && (
        <div className="info-display">
          <div className="info-item">
            <strong>Chip Type:</strong> {deviceInfo.chipType}
          </div>
          <div className="info-item">
            <strong>MAC Address:</strong> {deviceInfo.macAddress}
          </div>
          <div className="info-item">
            <strong>Flash Size:</strong> {deviceInfo.flashSize}
          </div>
          <div className="info-item">
            <strong>Flash Mode:</strong> {deviceInfo.flashMode}
          </div>
          <div className="info-item">
            <strong>Flash Frequency:</strong> {deviceInfo.flashFreq}
          </div>
          {deviceInfo.features.length > 0 && (
            <div className="info-item">
              <strong>Features:</strong> {deviceInfo.features.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

## Main App Component

```typescript
// App.tsx
import React from 'react';
import { useWebSerial } from './hooks/useWebSerial';
import FlashDevice from './components/FlashDevice';
import WiFiConfig from './components/WiFiConfig';
import Console from './components/Console';
import DeviceControls from './components/DeviceControls';
import DeviceInfo from './components/DeviceInfo';

const App: React.FC = () => {
  const { port, isConnected, checkWebSerialSupport, requestPort, disconnectPort } = useWebSerial();

  const handleConnect = async () => {
    try {
      await requestPort();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  if (!checkWebSerialSupport()) {
    return (
      <div className="app">
        <h1>WebSerial Not Supported</h1>
        <p>This application requires WebSerial API support. Please use Chrome or Edge.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>ESP Device Manager</h1>
        <div className="connection-status">
          {isConnected ? (
            <button onClick={disconnectPort}>Disconnect</button>
          ) : (
            <button onClick={handleConnect}>Connect Device</button>
          )}
          <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      <main>
        {port && (
          <>
            <DeviceInfo port={port} />
            <FlashDevice port={port} />
            <WiFiConfig port={port} />
            <DeviceControls port={port} />
            <Console port={port} />
          </>
        )}
      </main>
    </div>
  );
};

export default App;
```

## CSS Styles

```css
/* styles.css */
.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.status.connected {
  background-color: #d4edda;
  color: #155724;
}

.status.disconnected {
  background-color: #f8d7da;
  color: #721c24;
}

.console {
  border: 1px solid #ccc;
  border-radius: 4px;
  margin: 20px 0;
}

.console-output {
  height: 300px;
  overflow-y: auto;
  padding: 10px;
  background-color: #1e1e1e;
  color: #fff;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.log-line {
  margin: 2px 0;
  white-space: pre-wrap;
}

.console-input {
  display: flex;
  padding: 10px;
  background-color: #f8f9fa;
  border-top: 1px solid #ccc;
}

.console-input input {
  flex: 1;
  padding: 5px;
  margin: 0 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.progress {
  width: 100%;
  height: 20px;
  background-color: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
  margin: 10px 0;
}

.progress-bar {
  height: 100%;
  background-color: #4caf50;
  transition: width 0.3s ease;
}

.error {
  color: #d32f2f;
  background-color: #ffebee;
  padding: 10px;
  border-radius: 4px;
  margin: 10px 0;
}

.info-display {
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 4px;
  margin: 10px 0;
}

.info-item {
  margin: 5px 0;
}
```

## Important Notes

1. **HTTPS Required**: WebSerial API only works over HTTPS
2. **Browser Support**: Only Chrome/Edge support WebSerial
3. **Error Handling**: Always implement proper error handling for serial operations
4. **Cleanup**: Properly close connections and abort operations on unmount
5. **Security**: Be cautious with binary downloads and validate sources

## Usage Examples

```typescript
// Example: Flash specific firmware
const flashESP32 = () => {
  const firmwareUrl = 'https://firmware.esphome.io/esphome-web/2023.12.0/esphome-web-esp32.factory.bin';
  return flashDevice(firmwareUrl, true);
};

// Example: Configure WiFi after flashing
const setupNewDevice = async () => {
  await flashDevice(firmwareUrl, true);
  await configureWiFi();
};
```

This guide provides a complete implementation for WebSerial-based ESP device management in React TypeScript applications, following the patterns used in the ESPHome dashboard project. 