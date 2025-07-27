#include "CommandExecutor.h"
#include "CommandParser.h"

CommandExecutor::CommandExecutor()
{
    // Constructor - handlers will be registered by CLIService
}

String CommandExecutor::execute(const ParsedCommand &command)
{
    if (!command.isValid)
    {
        return "error " + command.errorMessage;
    }

    switch (command.type)
    {
    case CMD_GET:
        return handleGetCommand(command.action, command.payload);
    case CMD_SET:
        return handleSetCommand(command.action, command.payload);
    default:
        return "error invalid_command_type";
    }
}

void CommandExecutor::registerHandler(const String &action, CommandHandler handler)
{
    handlers[action] = handler;
}

String CommandExecutor::handleGetCommand(const String &action, const String &payload)
{
    // Validate action format
    if (action.length() == 0)
    {
        return "error empty_action";
    }

    auto it = handlers.find(action);
    if (it != handlers.end())
    {
        try
        {
            String result = it->second(payload);

            // Validate handler response
            if (result.length() == 0)
            {
                return "error empty_response";
            }

            // Check if handler returned an error
            if (result.startsWith("error "))
            {
                return result; // Pass through error from handler
            }

            return result;
        }
        catch (const std::exception &e)
        {
            return "error execution_exception";
        }
        catch (...)
        {
            return "error execution_failed";
        }
    }
    return "error unknown_action";
}

String CommandExecutor::handleSetCommand(const String &action, const String &payload)
{
    // Validate action format
    if (action.length() == 0)
    {
        return "error empty_action";
    }

    // SET commands typically require a payload
    if (payload.length() == 0)
    {
        return "error missing_payload";
    }

    auto it = handlers.find(action);
    if (it != handlers.end())
    {
        try
        {
            String result = it->second(payload);

            // Validate handler response
            if (result.length() == 0)
            {
                return "error empty_response";
            }

            // Check if handler returned an error
            if (result.startsWith("error "))
            {
                return result; // Pass through error from handler
            }

            return result;
        }
        catch (const std::exception &e)
        {
            return "error execution_exception";
        }
        catch (...)
        {
            return "error execution_failed";
        }
    }
    return "error unknown_action";
}