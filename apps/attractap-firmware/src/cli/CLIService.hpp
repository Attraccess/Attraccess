#pragma once

#include <Arduino.h>
#include <functional>
#include <vector>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "task_priorities.h"

// Simple minimal CLI service for line-based serial commands.
// Format per line: "<TYPE> <command> [payload...]"
// Examples:
//   GET firmware.version
//   SET attraccess.configuration {"hostname":"example.com","port":443}

namespace CLI_SERVICE
{
    enum CommandType
    {
        CLI_COMMAND_GET = 0,
        CLI_COMMAND_SET = 1
    };
}

class CLIService
{
public:
    using CommandHandler = std::function<void(const String &payload)>;

    CLIService();
    ~CLIService() = default;

    // Initialize the service (starts the background serial read task once)
    void setup();

    // Register handler by enum command type (GET/SET) and arbitrary command string
    void registerCommandHandler(CLI_SERVICE::CommandType type,
                                const String &command,
                                CommandHandler handler);

    // Send response back over serial using the required framing.
    void sendResponse(CLI_SERVICE::CommandType type, const String &command, const String &payload);

private:
    struct HandlerEntry
    {
        CLI_SERVICE::CommandType type;
        String command;
        CommandHandler handler;
    };

    static void serialTaskThunk(void *param);
    void serialTaskLoop();
    void processLine(const String &line);
    bool findHandler(CLI_SERVICE::CommandType type, const String &command, CommandHandler &outHandler);
    String typeToStringLower(CLI_SERVICE::CommandType type);

    // Storage for registered handlers
    std::vector<HandlerEntry> handlers;

    // FreeRTOS task handle (optional)
    TaskHandle_t taskHandle = nullptr;
};
