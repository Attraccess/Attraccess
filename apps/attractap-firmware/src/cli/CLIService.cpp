#include "CLIService.hpp"

static const size_t SERIAL_BUFFER_SIZE = 1024;

void CLIService::registerCommandHandler(const String &command, CommandHandler handler)
{
    HandlerEntry entry;
    entry.command = command;
    entry.handler = handler;
    handlers.push_back(entry);
}

void CLIService::sendResponse(const String &command, const String &payload)
{
    Serial.print("RESP ");
    Serial.print(command);
    Serial.print(' ');
    Serial.println(payload);
}

void CLIService::loop()
{
    // Accumulate input across loop() calls; treat both CR and LF as line endings
    while (Serial.available() > 0)
    {
        int ch = Serial.read();
        if (ch < 0)
        {
            break;
        }

        if (ch == '\r' || ch == '\n')
        {
            if (rxBuffer.length() > 0)
            {
                processLine(rxBuffer);
                rxBuffer = "";
            }
            continue;
        }

        if (rxBuffer.length() < SERIAL_BUFFER_SIZE - 1)
        {
            rxBuffer += static_cast<char>(ch);
        }
    }
}

void CLIService::processLine(const String &line)
{
    Serial.print("Processing line: ");
    Serial.println(line);

    // Split as: <command>[ <payload>]
    int spaceIndex = line.indexOf(' ');
    String command;
    String payload;
    if (spaceIndex == -1)
    {
        command = line;
        payload = "";
    }
    else
    {
        command = line.substring(0, spaceIndex);
        payload = line.substring(spaceIndex + 1);
    }

    Serial.print("Command: ");
    Serial.println(command);
    Serial.print("Payload: ");
    Serial.println(payload);

    CommandHandler handler;
    if (!findHandler(command, handler))
    {
        Serial.println("error unknown_command: " + command);
        return;
    }

    Serial.println("Executing Handler");
    handler(payload);
}

bool CLIService::findHandler(const String &command, CommandHandler &outHandler)
{
    for (const HandlerEntry &entry : handlers)
    {
        if (entry.command == command)
        {
            outHandler = entry.handler;
            return true;
        }
    }
    return false;
}

// Removed remember/lookup: responses must carry explicit type
