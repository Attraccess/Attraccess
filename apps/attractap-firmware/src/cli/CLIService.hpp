#pragma once

#include <Arduino.h>
#include <functional>
#include <map>
#include "CommandParser.hpp"
#include "CommandExecutor.hpp"
#include <Preferences.h>
#include "task_priorities.h"

/**
 * Function type for command handlers
 * Takes payload as input and returns response string
 */
typedef std::function<String(const String &payload)> CommandHandler;

/**
 * Response formatter class responsible for formatting and sending responses
 */
class ResponseFormatter
{
public:
    /**
     * Format and send a successful response
     * @param action The action that was executed
     * @param answer The response data
     */
    static void formatResponse(const String &action, const String &answer);

    /**
     * Format and send an error response
     * @param errorType The type of error that occurred
     * @param message Optional error message
     */
    static void formatError(const String &errorType, const String &message = "");

    static void sendLine(const String &line);
};

/**
 * Main CLI service class that coordinates command processing
 */
class CLIService
{
public:
    CLIService();
    ~CLIService();

    /**
     * Initialize the CLI service
     */
    void setup();

    /**
     * Register a command handler for extensibility
     * @param action The action string (e.g., "firmware.version")
     * @param handler The function to handle this command
     */
    void registerCommandHandler(const String &action, CommandHandler handler);
    void sendResponse(const String &action, const String &response);

private:
    static void taskFunction(void *param);
    void loop();

    CommandParser parser;
    CommandExecutor executor;
    String inputBuffer;

    // Error recovery state
    bool serialErrorRecovery;
    unsigned long lastSerialActivity;
    static const unsigned long SERIAL_TIMEOUT_MS = 5000;

    void processSerialInput();
    void handleCommand(const ParsedCommand &command);
    void sendError(const String &errorType, const String &message = "");

    // Error handling and recovery
    void handleSerialError();
    void recoverFromSerialError();
    bool isSerialHealthy();
    void clearInputBuffer();
};