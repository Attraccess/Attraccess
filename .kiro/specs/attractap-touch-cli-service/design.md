# Design Document

## Overview

The CLI Service is a new component that will be integrated into the existing attractap-touch firmware architecture. It provides a serial-based command-line interface that allows external applications to interact with the device programmatically. The service follows the established patterns used by other services in the firmware (WiFiService, AttraccessService, etc.) and integrates seamlessly with the main application loop.

The CLI Service implements a simple request-response protocol over serial communication, making it easy for external tools to query device information and control device functionality without interfering with the normal operation of the touch interface, NFC functionality, or network services.

## Architecture

### Component Integration

The CLI Service will be implemented as a standalone service class that follows the same patterns as existing services:

```
main.cpp
├── CLIService cliService;           // New CLI service instance
├── WiFiService wifiService;         // Existing services
├── AttraccessService attraccessService;
└── Other existing services...

setup() {
    // ... existing initialization ...
    cliService.begin();              // Initialize CLI service
}

loop() {
    // ... existing service updates ...
    cliService.update();             // Process CLI commands
}
```

### Service Architecture

The CLI Service will consist of several key components:

1. **CLIService Class**: Main service coordinator
2. **CommandParser**: Parses incoming serial commands
3. **CommandExecutor**: Executes parsed commands
4. **ResponseFormatter**: Formats and sends responses
5. **Command Handlers**: Individual handlers for specific commands

## Components and Interfaces

### CLIService Class

```cpp
class CLIService {
public:
    CLIService();
    ~CLIService();

    void begin();
    void update();

    // Command registration for extensibility
    void registerCommandHandler(const String& action, CommandHandler handler);

private:
    CommandParser parser;
    CommandExecutor executor;
    ResponseFormatter formatter;
    String inputBuffer;

    void processSerialInput();
    void handleCommand(const ParsedCommand& command);
    void sendResponse(const String& action, const String& response);
    void sendError(const String& errorType, const String& message = "");
};
```

### Command Structure

```cpp
enum CommandType {
    CMD_GET,
    CMD_SET,
    CMD_INVALID
};

struct ParsedCommand {
    CommandType type;
    String action;
    String payload;
    bool isValid;
    String errorMessage;
};

typedef std::function<String(const String& payload)> CommandHandler;
```

### CommandParser Class

```cpp
class CommandParser {
public:
    ParsedCommand parse(const String& input);

private:
    bool isValidCommandFormat(const String& input);
    CommandType parseCommandType(const String& typeStr);
    void extractActionAndPayload(const String& input, String& action, String& payload);
};
```

### CommandExecutor Class

```cpp
class CommandExecutor {
public:
    CommandExecutor();

    String execute(const ParsedCommand& command);
    void registerHandler(const String& action, CommandHandler handler);

private:
    std::map<String, CommandHandler> handlers;

    String handleGetCommand(const String& action, const String& payload);
    String handleSetCommand(const String& action, const String& payload);
};
```

### ResponseFormatter Class

```cpp
class ResponseFormatter {
public:
    static String formatResponse(const String& action, const String& answer);
    static String formatError(const String& errorType, const String& message = "");

private:
    static void sendLine(const String& line);
};
```

## Data Models

### Command Protocol Format

**Command Format:**

```
CMND <GET|SET> <action> [payload]
```

**Response Format:**

```
RESP <action> <answer>
```

**Error Format:**

```
RESP error <error_type> [error_message]
```

### Command Examples

1. **Firmware Version Query:**

   - Command: `CMND GET firmware.version`
   - Response: `RESP firmware.version 1.0.0`

2. **Invalid Command:**

   - Command: `INVALID COMMAND FORMAT`
   - Response: `RESP error invalid_command_format`

3. **Unknown Action:**
   - Command: `CMND GET unknown.action`
   - Response: `RESP error unknown_action`

### Initial Command Set

For the initial implementation, only the firmware version command will be supported:

- `firmware.version` (GET): Returns the current firmware version

## Error Handling

### Error Types

1. **invalid_command_format**: Command doesn't match expected format
2. **unknown_action**: Requested action is not registered
3. **execution_error**: Command execution failed
4. **payload_error**: Invalid or missing payload for command that requires it

### Error Response Strategy

- All errors follow the standard response format
- Errors are non-fatal - the service continues processing subsequent commands
- Serial communication errors are handled gracefully with automatic recovery
- Buffer overflow protection prevents memory issues from malformed input

### Recovery Mechanisms

- Input buffer is cleared after processing each command
- Serial buffer is flushed on initialization
- Malformed commands don't affect subsequent command processing
- Service continues running even if individual commands fail

## Testing Strategy

### Unit Testing Approach

Due to the embedded nature of the firmware, testing will focus on:

1. **Command Parsing Tests**: Verify correct parsing of various command formats
2. **Response Formatting Tests**: Ensure responses follow the correct format
3. **Error Handling Tests**: Verify proper error responses for invalid inputs
4. **Integration Tests**: Test with actual serial communication

### Test Cases

#### Command Parsing Tests

- Valid GET commands with and without payload
- Valid SET commands with and without payload
- Invalid command formats
- Empty commands
- Commands with extra whitespace
- Commands with special characters

#### Response Formatting Tests

- Successful command responses
- Error responses
- Response line endings
- Response timing

#### Integration Tests

- Serial communication at 115200 baud
- Multiple commands in sequence
- Command processing during normal device operation
- Memory usage during extended operation

### Manual Testing Protocol

1. **Basic Functionality**:

   - Send `CMND GET firmware.version` and verify response
   - Send invalid commands and verify error responses
   - Test multiple commands in sequence

2. **Integration Testing**:

   - Verify CLI service doesn't interfere with touch interface
   - Verify CLI service doesn't interfere with NFC functionality
   - Verify CLI service doesn't interfere with WiFi connectivity
   - Test CLI service during various device states (connected, disconnected, etc.)

3. **Performance Testing**:

   - Monitor memory usage with CLI service active
   - Verify response times are within acceptable limits
   - Test with rapid command sequences

4. **Error Handling Testing**:
   - Test with malformed commands
   - Test with very long input strings
   - Test serial communication interruption and recovery

## Implementation Notes

### Memory Management

- Use String class for simplicity but monitor memory usage
- Clear input buffer after each command to prevent memory leaks
- Limit maximum command length to prevent buffer overflow

### Serial Communication

- Use existing Serial object (115200 baud, already initialized in main.cpp)
- Non-blocking serial reading to prevent interference with main loop
- Process one command per update() call to maintain responsiveness

### Extensibility

- Command handler registration system allows easy addition of new commands
- Separate parsing, execution, and formatting for clean architecture
- Standard interfaces make it easy to add new command types

### Integration with Existing Services

- CLI service can access other services through global instances
- Commands can query WiFi status, Attraccess connection state, etc.
- Future commands can control device functionality through existing service APIs
