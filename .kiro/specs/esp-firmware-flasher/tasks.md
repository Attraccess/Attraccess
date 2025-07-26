# Implementation Plan

- [x] 1. Install and configure esptool-js dependency

  - Add esptool-js package to project dependencies
  - Configure TypeScript types for esptool-js
  - Verify Web Serial API compatibility in project setup
  - _Requirements: 1.2, 5.1_

- [x] 2. Create Serial Port Manager service

  - Implement singleton SerialPortManager class with port reservation system
  - Add methods for requesting, releasing, and checking port availability
  - Implement browser tab coordination using localStorage for port conflicts
  - Create cleanup mechanisms for automatic port release on component unmount
  - Write unit tests for port management functionality
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3. Create Firmware API service

  - Implement FirmwareApiService class for downloading firmware binaries
  - Add method to construct firmware download URL from AttractapFirmware object
  - Implement firmware validation using MD5 hash calculation with SparkMD5
  - Add error handling for network failures and invalid firmware data
  - Write unit tests for firmware download and validation
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 4. Create base Progress Display component

  - Create ProgressDisplay component with progress bar and status text
  - Implement FlashingStage enum and state management
  - Add toggle for advanced/debug mode with detailed logs
  - Create translation files (de.json, en.json) for progress messages
  - Style component with HeroUI components for consistent design
  - Write unit tests for progress state transitions
  - _Requirements: 2.3, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

- [x] 4-1 Run build and if any issues occur, fix them

  - run `pnpm nx run-many -t build` and if any issues occur, fix them

- [x] 4-2 Run typecheck and if any issues occur, fix them

  - run `pnpm nx run-many -t typecheck` and if any issues occur, fix them

- [x] 4-3 Run lint and if any issues occur, fix them

  - run `pnpm nx run-many -t lint` and if any issues occur, fix them

- [x] 4-4 Run test and if any issues occur, fix them

  - run `pnpm nx run-many -t test` and if any issues occur, fix them

- [x] 4-5 Run e2e and if any issues occur, fix them

  - run `pnpm nx run-many -t e2e` and if any issues occur, fix them

- [x] 5. Create Error Display component

  - Implement ErrorDisplay component with user-friendly error messages
  - Create error categorization system (connection, firmware, flashing errors)
  - Add progressive disclosure for technical details
  - Implement actionable solutions and recovery options
  - Create translation files (de.json, en.json) for error messages
  - Write unit tests for error display and recovery actions
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.4, 8.1, 8.2, 8.3_

- [x] 6. Create Port Selector component

  - Implement PortSelector component for serial port selection
  - Add Web Serial API integration for port enumeration
  - Implement device detection and ESP32 identification
  - Add user guidance for port selection and device connection
  - Create translation files (de.json, en.json) for port selection UI
  - Write unit tests for port selection functionality
  - _Requirements: 1.2, 6.1, 6.4, 8.1, 8.2, 8.3_

- [x] 7. Create main Firmware Flasher component

  - Implement FirmwareFlasher component with wizard-like interface
  - Integrate PortSelector, ProgressDisplay, and ErrorDisplay components
  - Add esptool-js integration for actual firmware flashing
  - Implement flashing workflow: connect → download → erase → flash → verify
  - Create translation files (de.json, en.json) for main flasher interface
  - Write integration tests for complete flashing workflow
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.5, 8.1, 8.2, 8.3_

- [ ] 8. Integrate Firmware Flasher into Installer modal

  - Replace "Flasher here" placeholder in AttractapInstaller component
  - Pass selected firmware data to FirmwareFlasher component
  - Handle completion callback to transition to console view
  - Ensure proper cleanup when modal is closed
  - Test integration with existing FirmwareSelector component
  - _Requirements: 1.1, 3.1_

- [ ] 9. Create Serial Console component

  - Implement SerialConsole component with read-only console output
  - Add real-time serial data reception and display
  - Implement auto-scrolling with line limits and memory management
  - Add connection status indicator and clear/export functionality
  - Create translation files (de.json, en.json) for console interface
  - Write unit tests for console data handling and display
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3_

- [ ] 10. Add Serial Console button to AttractapList

  - Add "Open Console" button to PageHeader actions in AttractapList
  - Implement modal or separate view for standalone serial console
  - Ensure proper integration with SerialPortManager to prevent conflicts
  - Add appropriate icon and styling consistent with existing design
  - Update translation files for AttractapList with console button text
  - Test console opening from reader list independently of flasher
  - _Requirements: 3.2, 4.1, 4.2, 8.1, 8.2, 8.3_

- [ ] 11. Implement automatic console transition after flashing

  - Add logic to automatically open SerialConsole after successful firmware flashing
  - Ensure smooth transition from flasher to console within the same modal
  - Implement proper port handoff from flasher to console
  - Add user option to skip automatic console opening
  - Test transition workflow and port management
  - _Requirements: 3.1, 4.3_

- [ ] 12. Add comprehensive error handling and user guidance

  - Implement Web Serial API support detection and user guidance
  - Add device reset instructions with visual guides for bootloader mode
  - Create help system with common troubleshooting steps
  - Implement retry mechanisms for recoverable errors
  - Add logging system for debugging and support purposes
  - Test error scenarios and recovery workflows
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.4_

- [ ] 13. Optimize performance and memory management

  - Implement streaming download for large firmware files
  - Add memory cleanup for firmware binaries after flashing
  - Optimize console output rendering for large amounts of data
  - Implement virtual scrolling for console if needed
  - Add timeout handling for long-running operations
  - Test performance with various firmware sizes and console outputs
  - _Requirements: 1.3, 2.5, 3.5_

- [ ] 14. Create comprehensive test suite
  - Write end-to-end tests for complete flashing workflow
  - Add tests for error scenarios and recovery mechanisms
  - Create tests for multi-tab port conflict scenarios
  - Add browser compatibility tests for Web Serial API
  - Implement mock serial devices for testing
  - Test translation completeness and accuracy
  - _Requirements: All requirements validation_
