# Requirements Document

## Introduction

This feature implements a comprehensive ESP32 firmware flashing system for Attractap devices using esptool-js. The system allows users to flash firmware directly from the web browser, monitor the flashing process through a console interface, and access a standalone serial console for device communication. The implementation ensures proper resource management to prevent conflicts when multiple components attempt to access serial ports simultaneously.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to flash ESP32 firmware through the web interface, so that I can update Attractap devices without requiring external tools.

#### Acceptance Criteria

1. WHEN the user selects a firmware from the FirmwareSelector THEN the system SHALL display a firmware flashing interface
2. WHEN the user initiates the flashing process THEN the system SHALL connect to the selected serial port using esptool-js
3. WHEN the firmware binary is being flashed THEN the system SHALL display real-time progress information
4. WHEN the flashing process completes successfully THEN the system SHALL display a success message and transition to console view
5. WHEN the flashing process fails THEN the system SHALL display detailed error information and allow retry

### Requirement 2

**User Story:** As a system administrator, I want to see real-time console output during firmware flashing, so that I can monitor the process and troubleshoot issues.

#### Acceptance Criteria

1. WHEN the flashing process starts THEN the system SHALL display a minimal progress interface with option to show detailed console
2. WHEN esptool-js writes log messages THEN the system SHALL display them only when advanced/debug mode is enabled
3. WHEN the flashing process includes multiple steps THEN the system SHALL show simple progress indicators (progress bar, percentage)
4. WHEN errors occur during flashing THEN the system SHALL display user-friendly error messages with option to view technical details
5. WHEN advanced users enable debug mode THEN the system SHALL show full console output with automatic scrolling

### Requirement 3

**User Story:** As a system administrator, I want to access a read-only serial console for ESP32 devices, so that I can monitor device output and debug issues after flashing.

#### Acceptance Criteria

1. WHEN the firmware flashing completes successfully THEN the system SHALL automatically open a read-only serial console
2. WHEN the user clicks the serial console button in the reader list THEN the system SHALL open a standalone read-only serial console
3. WHEN the serial console is active THEN the system SHALL display real-time serial output from the device
4. WHEN the serial console receives data THEN the system SHALL display it in a scrollable, read-only text area
5. WHEN the serial console is closed THEN the system SHALL properly release the serial port connection

### Requirement 4

**User Story:** As a system administrator, I want proper resource management for serial ports, so that multiple components don't interfere with each other when accessing devices.

#### Acceptance Criteria

1. WHEN a serial port is in use by the flasher THEN other components SHALL NOT be able to access the same port
2. WHEN a serial port is in use by the console THEN the flasher SHALL NOT be able to access the same port
3. WHEN switching between flasher and console modes THEN the system SHALL properly release and acquire port connections
4. WHEN multiple browser tabs are open THEN only one tab SHALL be able to access a specific serial port at a time
5. WHEN a component crashes or is closed unexpectedly THEN the system SHALL automatically release any held serial port connections

### Requirement 5

**User Story:** As a system administrator, I want the firmware flasher to integrate with the existing API, so that I can access firmware binaries and metadata seamlessly.

#### Acceptance Criteria

1. WHEN the flasher needs firmware binary data THEN the system SHALL fetch it from the `/attractap/firmware/:firmwareName/variants/:variantName/:filename` endpoint
2. WHEN fetching firmware binaries THEN the system SHALL use the normal filename (not the flashz compressed version)
3. WHEN the firmware binary is downloaded THEN the system SHALL verify its integrity using MD5 hash calculation
4. WHEN the API request fails THEN the system SHALL display appropriate error messages and allow retry
5. WHEN firmware metadata is needed THEN the system SHALL use the already selected AttractapFirmware object from the FirmwareSelector

### Requirement 6

**User Story:** As a system administrator, I want the firmware flasher to have proper error handling and user feedback, so that I can understand and resolve issues during the flashing process.

#### Acceptance Criteria

1. WHEN serial port access is denied THEN the system SHALL display simple instructions with visual guides for enabling Web Serial API
2. WHEN the selected serial port is not an ESP32 device THEN the system SHALL display a user-friendly error message with suggested solutions
3. WHEN the firmware binary is corrupted or invalid THEN the system SHALL detect and report the issue in non-technical terms
4. WHEN the device is not in bootloader mode THEN the system SHALL provide visual instructions for device reset with clear step-by-step guidance
5. WHEN network errors occur during firmware download THEN the system SHALL display simple retry options with minimal technical jargon

### Requirement 7

**User Story:** As a non-technical user, I want a simple and intuitive firmware flashing interface, so that I can update devices without needing technical expertise.

#### Acceptance Criteria

1. WHEN the firmware flasher opens THEN the system SHALL display a clean, minimal interface with clear action buttons
2. WHEN the flashing process is running THEN the system SHALL show simple progress indicators (progress bar, status text)
3. WHEN advanced options are available THEN the system SHALL hide them behind an "Advanced" or "Show Details" toggle
4. WHEN errors occur THEN the system SHALL display solutions in plain language before showing technical details
5. WHEN the process completes THEN the system SHALL show clear success/failure status with next steps

### Requirement 8

**User Story:** As a user, I want the firmware flasher interface to be available in both German and English, so that I can use the system in my preferred language.

#### Acceptance Criteria

1. WHEN any component is rendered THEN the system SHALL load translations from de.json and en.json files located in the same directory as the component
2. WHEN the user's language preference is German THEN all interface text SHALL be displayed in German
3. WHEN the user's language preference is English THEN all interface text SHALL be displayed in English
4. WHEN new components are created THEN each component folder SHALL contain its own de.json and en.json translation files
5. WHEN translation keys are missing THEN the system SHALL fallback to English and log the missing translation