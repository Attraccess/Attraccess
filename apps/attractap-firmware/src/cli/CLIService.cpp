#include "CLIService.hpp"
#include "CommandParser.hpp"
#include "CommandExecutor.hpp"
#include <ArduinoJson.h>

// Maximum input buffer size to prevent overflow
#define MAX_INPUT_BUFFER_SIZE 256

//=============================================================================
// ResponseFormatter Implementation
//=============================================================================

void ResponseFormatter::formatResponse(const String &action, const String &answer)
{
    // Validate inputs
    if (action.length() == 0)
    {
        formatError("internal_error", "empty_action_in_response");
        return;
    }

    if (answer.length() == 0)
    {
        formatError("internal_error", "empty_answer_in_response");
        return;
    }

    // Check for line breaks in response that could break protocol
    if (action.indexOf('\n') != -1 || action.indexOf('\r') != -1 ||
        answer.indexOf('\n') != -1 || answer.indexOf('\r') != -1)
    {
        formatError("internal_error", "invalid_characters_in_response");
        return;
    }

    String response = "RESP " + action + " " + answer;

    sendLine(response);
}

void ResponseFormatter::formatError(const String &errorType, const String &message)
{
    // Validate error type
    if (errorType.length() == 0)
    {
        sendLine("RESP error internal_error empty_error_type");
        return;
    }

    // Check for line breaks in error that could break protocol
    if (errorType.indexOf('\n') != -1 || errorType.indexOf('\r') != -1 ||
        (message.length() > 0 && (message.indexOf('\n') != -1 || message.indexOf('\r') != -1)))
    {
        sendLine("RESP error internal_error invalid_characters_in_error");
        return;
    }

    String response = "RESP error " + errorType;
    if (message.length() > 0)
    {
        response += " " + message;
    }

    sendLine(response);
}

void ResponseFormatter::sendLine(const String &line)
{
    // Final validation before sending
    if (line.length() == 0)
    {
        Serial.println("RESP error internal_error empty_response_line");
        Serial.flush();
        return;
    }

    try
    {
        Serial.println(line);
        Serial.flush(); // Ensure immediate transmission
    }
    catch (...)
    {
        // If serial write fails, there's not much we can do
        // The serial error handling in CLIService will detect this
    }
}

//=============================================================================
// CLIService Implementation
//=============================================================================

CLIService::CLIService()
{
    inputBuffer.reserve(MAX_INPUT_BUFFER_SIZE);
    serialErrorRecovery = false;
    lastSerialActivity = 0;
}

CLIService::~CLIService()
{
    // Destructor
}

void CLIService::setup()
{
    // Serial is already initialized in main.cpp at 115200 baud
    Serial.println("CLI Service initialized");

    // Clear any existing serial input and reset error state
    clearInputBuffer();
    serialErrorRecovery = false;
    lastSerialActivity = millis();

    xTaskCreate(
        CLIService::taskFn,
        "CLIService",
        4096,
        this,
        1,
        NULL);
}

void CLIService::taskFn(void *parameter)
{
    CLIService *cliService = (CLIService *)parameter;
    while (true)
    {
        cliService->update();
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void CLIService::update()
{
    // Check for serial communication health
    if (!isSerialHealthy())
    {
        handleSerialError();
        return;
    }

    // Process serial input if not in error recovery mode
    if (!serialErrorRecovery)
    {
        processSerialInput();
    }
    else
    {
        // Attempt recovery from serial error
        recoverFromSerialError();
    }
}

void CLIService::registerCommandHandler(const String &action, CommandHandler handler)
{
    executor.registerHandler(action, handler);
}

void CLIService::processSerialInput()
{
    while (Serial.available())
    {
        char c = Serial.read();
        lastSerialActivity = millis(); // Update activity timestamp

        if (c == '\n' || c == '\r')
        {
            // End of command - process it
            if (inputBuffer.length() > 0)
            {
                try
                {
                    ParsedCommand command = parser.parse(inputBuffer);
                    handleCommand(command);
                }
                catch (...)
                {
                    // Catch any unexpected errors during command processing
                    ResponseFormatter::formatError("execution_error", "command_processing_failed");
                }
                clearInputBuffer(); // Clear buffer for next command
            }
        }
        else if (c >= 32 && c <= 126)
        { // Printable ASCII characters
            // Add character to buffer if there's space
            if (inputBuffer.length() < MAX_INPUT_BUFFER_SIZE - 1)
            {
                inputBuffer += c;
            }
            else
            {
                // Buffer overflow protection - clear buffer and send error
                clearInputBuffer();
                ResponseFormatter::formatError("buffer_overflow", "command_too_long");

                // Skip remaining characters until newline to prevent further overflow
                while (Serial.available() && Serial.peek() != '\n' && Serial.peek() != '\r')
                {
                    Serial.read();
                }
            }
        }
        else if (c < 32 && c != '\n' && c != '\r')
        {
            // Handle unexpected control characters
            ResponseFormatter::formatError("invalid_character", "non_printable_character_received");
            clearInputBuffer(); // Clear potentially corrupted buffer
        }
        // Ignore other characters (normal control characters like \t, etc.)
    }
}

void CLIService::handleCommand(const ParsedCommand &command)
{
    // Validate command structure
    if (!command.isValid)
    {
        ResponseFormatter::formatError(command.errorMessage);
        return;
    }

    // Additional validation for command execution
    if (command.action.length() == 0)
    {
        ResponseFormatter::formatError("empty_action");
        return;
    }

    try
    {
        String response = executor.execute(command);

        // Validate response from executor
        if (response.length() == 0)
        {
            ResponseFormatter::formatError("empty_response", "executor_returned_empty");
            return;
        }

        // Check if response is an error
        if (response.startsWith("error "))
        {
            String errorPart = response.substring(6); // Remove "error " prefix
            int spaceIndex = errorPart.indexOf(' ');
            if (spaceIndex != -1)
            {
                String errorType = errorPart.substring(0, spaceIndex);
                String errorMessage = errorPart.substring(spaceIndex + 1);
                ResponseFormatter::formatError(errorType, errorMessage);
            }
            else
            {
                ResponseFormatter::formatError(errorPart);
            }
        }
        else
        {
            ResponseFormatter::formatResponse(command.action, response);
        }
    }
    catch (const std::exception &e)
    {
        ResponseFormatter::formatError("execution_exception", "command_handler_threw_exception");
    }
    catch (...)
    {
        ResponseFormatter::formatError("execution_failed", "unknown_exception_in_handler");
    }
}

//=============================================================================
// Error Handling and Recovery Implementation
//=============================================================================

void CLIService::handleSerialError()
{
    // Enter error recovery mode
    serialErrorRecovery = true;

    // Clear any corrupted input buffer
    clearInputBuffer();

    // Log error (if logging is available)
    Serial.println("CLI Service: Serial communication error detected, entering recovery mode");

    // Set recovery start time
    lastSerialActivity = millis();
}

void CLIService::recoverFromSerialError()
{
    // Check if enough time has passed for recovery attempt
    unsigned long currentTime = millis();
    if (currentTime - lastSerialActivity > 1000)
    { // Wait 1 second before recovery

        // Clear serial buffers
        while (Serial.available())
        {
            Serial.read(); // Flush input buffer
        }
        Serial.flush(); // Flush output buffer

        // Reset input buffer
        clearInputBuffer();

        // Test serial communication
        if (isSerialHealthy())
        {
            serialErrorRecovery = false;
            lastSerialActivity = currentTime;
            Serial.println("CLI Service: Serial communication recovered");
        }
        else
        {
            // If still not healthy, wait longer before next attempt
            lastSerialActivity = currentTime;
        }
    }
}

bool CLIService::isSerialHealthy()
{
    // Check if Serial is available and functioning
    if (!Serial)
    {
        return false;
    }

    // Check for timeout - if no activity for too long, consider unhealthy
    unsigned long currentTime = millis();
    if (serialErrorRecovery && (currentTime - lastSerialActivity > SERIAL_TIMEOUT_MS))
    {
        return false;
    }

    // Update last activity time if we have data available
    if (Serial.available())
    {
        lastSerialActivity = currentTime;
    }

    return true;
}

void CLIService::clearInputBuffer()
{
    inputBuffer = "";

    // Also clear any pending serial input
    while (Serial.available())
    {
        Serial.read();
    }
}
