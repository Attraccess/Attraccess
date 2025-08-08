#include "CLIService.hpp"

static const size_t SERIAL_BUFFER_SIZE = 1024;

CLIService::CLIService() {}

void CLIService::setup()
{
    if (taskHandle != nullptr)
    {
        return; // already started
    }
    // Start FreeRTOS task to read serial input continuously
    xTaskCreate(
        &CLIService::serialTaskThunk,
        "cli_serial_task",
        4096,
        this,
        1,
        &taskHandle);
}

void CLIService::registerCommandHandler(CLI_SERVICE::CommandType type,
                                        const String &command,
                                        CommandHandler handler)
{
    HandlerEntry entry;
    entry.type = type;
    entry.command = command;
    entry.handler = handler;
    handlers.push_back(entry);
}

String CLIService::typeToStringLower(CLI_SERVICE::CommandType type)
{
    return (type == CLI_SERVICE::CLI_COMMAND_GET) ? String("get") : String("set");
}

void CLIService::sendResponse(CLI_SERVICE::CommandType type, const String &command, const String &payload)
{
    Serial.print("RESP ");
    Serial.print(typeToStringLower(type));
    Serial.print(' ');
    Serial.print(command);
    Serial.print(' ');
    Serial.println(payload);
}

// No overload without type: callers must specify GET/SET explicitly

void CLIService::serialTaskThunk(void *param)
{
    CLIService *self = static_cast<CLIService *>(param);
    self->serialTaskLoop();
}

void CLIService::serialTaskLoop()
{
    String line;
    line.reserve(SERIAL_BUFFER_SIZE);

    while (true)
    {
        // Accumulate one line terminated by \n
        while (Serial.available() > 0)
        {
            int ch = Serial.read();
            if (ch < 0)
            {
                break;
            }
            if (ch == '\r')
            {
                continue; // ignore CR
            }
            if (ch == '\n')
            {
                if (line.length() > 0)
                {
                    processLine(line);
                    line = "";
                }
                continue;
            }
            if (line.length() < SERIAL_BUFFER_SIZE - 1)
            {
                line += static_cast<char>(ch);
            }
        }

        // Yield to other tasks
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void CLIService::processLine(const String &line)
{
    // Expected minimal format: "<TYPE> <command> [payload...]"
    int firstSpace = line.indexOf(' ');
    if (firstSpace < 0)
    {
        // no space -> malformed
        Serial.println("error malformed_request");
        return;
    }
    String typeToken = line.substring(0, firstSpace);
    typeToken.trim();
    typeToken.toUpperCase();
    // Require framing token "CMND"
    if (typeToken != "CMND")
    {
        Serial.println("error malformed_request");
        return;
    }

    // Expect GET/SET as next token
    int secondSpace = line.indexOf(' ', firstSpace + 1);
    if (secondSpace < 0)
    {
        Serial.println("error missing_type");
        return;
    }

    String methodToken = line.substring(firstSpace + 1, secondSpace);
    methodToken.trim();
    methodToken.toUpperCase();

    CLI_SERVICE::CommandType typeEnum;
    if (methodToken == "GET")
    {
        typeEnum = CLI_SERVICE::CLI_COMMAND_GET;
    }
    else if (methodToken == "SET")
    {
        typeEnum = CLI_SERVICE::CLI_COMMAND_SET;
    }
    else
    {
        Serial.println("error unknown_type");
        return;
    }

    String command;
    String payload = "";
    int thirdSpace = line.indexOf(' ', secondSpace + 1);
    if (thirdSpace < 0)
    {
        // No payload provided; everything after the method token is the command
        command = line.substring(secondSpace + 1);
        command.trim();
    }
    else
    {
        command = line.substring(secondSpace + 1, thirdSpace);
        command.trim();
        if (thirdSpace + 1 < static_cast<int>(line.length()))
        {
            payload = line.substring(thirdSpace + 1);
            payload.trim();
        }
    }

    CommandHandler handler;
    if (!findHandler(typeEnum, command, handler))
    {
        Serial.println("error unknown_command");
        return;
    }

    try
    {
        handler(payload);
    }
    catch (...)
    {
        sendResponse(typeEnum, command, "error handler_exception");
    }
}

bool CLIService::findHandler(CLI_SERVICE::CommandType type, const String &command, CommandHandler &outHandler)
{
    for (const HandlerEntry &entry : handlers)
    {
        if (entry.type == type && entry.command == command)
        {
            outHandler = entry.handler;
            return true;
        }
    }
    return false;
}

// Removed remember/lookup: responses must carry explicit type
