#pragma once

#include <Arduino.h>
#include <functional>
#include <vector>

class CLIService
{
public:
    using CommandHandler = std::function<void(const String &payload)>;

    void loop();

    void registerCommandHandler(const String &command, CommandHandler handler);
    void sendResponse(const String &command, const String &payload);

private:
    struct HandlerEntry
    {
        String command;
        CommandHandler handler;
    };

    void processLine(const String &line);
    bool findHandler(const String &command, CommandHandler &outHandler);

    // Storage for registered handlers
    std::vector<HandlerEntry> handlers;

    // Accumulator for incoming serial data across loop() calls
    String rxBuffer;
};
