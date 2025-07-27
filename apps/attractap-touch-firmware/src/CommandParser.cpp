#include "CommandParser.h"

// Maximum input buffer size to prevent overflow
#define MAX_INPUT_BUFFER_SIZE 256

// Maximum command length for validation
#define MAX_COMMAND_LENGTH 200

ParsedCommand CommandParser::parse(const String &input)
{
    ParsedCommand cmd;

    // Trim whitespace
    String trimmedInput = input;
    trimmedInput.trim();

    // Check if input is empty
    if (trimmedInput.length() == 0)
    {
        cmd.isValid = false;
        cmd.errorMessage = "empty_command";
        return cmd;
    }

    // Check for excessively long commands
    if (trimmedInput.length() > MAX_COMMAND_LENGTH)
    {
        cmd.isValid = false;
        cmd.errorMessage = "command_too_long";
        return cmd;
    }

    // Check for invalid characters that could cause parsing issues
    for (int i = 0; i < trimmedInput.length(); i++)
    {
        char c = trimmedInput.charAt(i);
        if (c < 32 || c > 126)
        {
            cmd.isValid = false;
            cmd.errorMessage = "invalid_character";
            return cmd;
        }
    }

    // Check basic format validation
    if (!isValidCommandFormat(trimmedInput))
    {
        cmd.isValid = false;
        cmd.errorMessage = "invalid_command_format";
        return cmd;
    }

    // Split the command into parts
    int firstSpace = trimmedInput.indexOf(' ');
    int secondSpace = trimmedInput.indexOf(' ', firstSpace + 1);

    if (firstSpace == -1)
    {
        // No spaces found - invalid format
        cmd.isValid = false;
        cmd.errorMessage = "invalid_command_format";
        return cmd;
    }

    if (secondSpace == -1)
    {
        // Handle commands without payload (only CMND TYPE ACTION)
        String cmdPart = trimmedInput.substring(0, firstSpace);
        String remaining = trimmedInput.substring(firstSpace + 1);

        int typeSpace = remaining.indexOf(' ');
        if (typeSpace == -1)
        {
            // Missing action part
            cmd.isValid = false;
            cmd.errorMessage = "missing_action";
            return cmd;
        }

        String typeStr = remaining.substring(0, typeSpace);
        String actionStr = remaining.substring(typeSpace + 1);

        // Validate command part
        if (!cmdPart.equals("CMND"))
        {
            cmd.isValid = false;
            cmd.errorMessage = "invalid_command_format";
            return cmd;
        }

        // Validate action is not empty
        if (actionStr.length() == 0)
        {
            cmd.isValid = false;
            cmd.errorMessage = "missing_action";
            return cmd;
        }

        // Validate type
        if (!isValidType(typeStr))
        {
            cmd.isValid = false;
            cmd.errorMessage = "invalid_type";
            return cmd;
        }

        // Validate action
        if (!isValidAction(actionStr))
        {
            cmd.isValid = false;
            cmd.errorMessage = "invalid_action";
            return cmd;
        }

        cmd.isValid = true;
        cmd.type = parseCommandType(typeStr);
        cmd.action = actionStr;
        cmd.payload = "";
        return cmd;
    }
    else
    {
        // Handle commands with payload (CMND TYPE ACTION PAYLOAD)
        String cmdPart = trimmedInput.substring(0, firstSpace);
        String remaining = trimmedInput.substring(firstSpace + 1);

        int typeSpace = remaining.indexOf(' ');
        if (typeSpace == -1)
        {
            cmd.isValid = false;
            cmd.errorMessage = "invalid_command_format";
            return cmd;
        }

        String typeStr = remaining.substring(0, typeSpace);
        String actionAndPayload = remaining.substring(typeSpace + 1);

        int actionSpace = actionAndPayload.indexOf(' ');
        if (actionSpace == -1)
        {
            // No payload
            String actionStr = actionAndPayload;

            // Validate command part
            if (!cmdPart.equals("CMND"))
            {
                cmd.isValid = false;
                cmd.errorMessage = "invalid_command_format";
                return cmd;
            }

            // Validate action is not empty
            if (actionStr.length() == 0)
            {
                cmd.isValid = false;
                cmd.errorMessage = "missing_action";
                return cmd;
            }

            // Validate type
            if (!isValidType(typeStr))
            {
                cmd.isValid = false;
                cmd.errorMessage = "invalid_type";
                return cmd;
            }

            // Validate action
            if (!isValidAction(actionStr))
            {
                cmd.isValid = false;
                cmd.errorMessage = "invalid_action";
                return cmd;
            }

            cmd.isValid = true;
            cmd.type = parseCommandType(typeStr);
            cmd.action = actionStr;
            cmd.payload = "";
            return cmd;
        }
        else
        {
            // Has payload
            String actionStr = actionAndPayload.substring(0, actionSpace);
            String payloadStr = actionAndPayload.substring(actionSpace + 1);

            // Validate command part
            if (!cmdPart.equals("CMND"))
            {
                cmd.isValid = false;
                cmd.errorMessage = "invalid_command_format";
                return cmd;
            }

            // Validate action is not empty
            if (actionStr.length() == 0)
            {
                cmd.isValid = false;
                cmd.errorMessage = "missing_action";
                return cmd;
            }

            // Validate type
            if (!isValidType(typeStr))
            {
                cmd.isValid = false;
                cmd.errorMessage = "invalid_type";
                return cmd;
            }

            // Validate action
            if (!isValidAction(actionStr))
            {
                cmd.isValid = false;
                cmd.errorMessage = "invalid_action";
                return cmd;
            }

            cmd.isValid = true;
            cmd.type = parseCommandType(typeStr);
            cmd.action = actionStr;
            cmd.payload = payloadStr;
            return cmd;
        }
    }
}

bool CommandParser::isValidCommandFormat(const String &input)
{
    // Basic format check: should start with "CMND"
    return input.startsWith("CMND ");
}

bool CommandParser::isValidAction(const String &action)
{
    // Add validation for specific actions if needed
    // For now, just check it's not empty and contains valid characters
    if (action.length() == 0)
        return false;

    // Check for valid characters (alphanumeric, dots, underscores, hyphens)
    for (int i = 0; i < action.length(); i++)
    {
        char c = action.charAt(i);
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-'))
        {
            return false;
        }
    }
    return true;
}

bool CommandParser::isValidType(const String &type)
{
    // Check if type is GET or SET
    return type.equals("GET") || type.equals("SET");
}

CommandType CommandParser::parseCommandType(const String &typeStr)
{
    if (typeStr.equals("GET"))
    {
        return CMD_GET;
    }
    else if (typeStr.equals("SET"))
    {
        return CMD_SET;
    }
    return CMD_INVALID;
}