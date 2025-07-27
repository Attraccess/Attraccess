#ifndef COMMAND_PARSER_H
#define COMMAND_PARSER_H

#include <Arduino.h>

/**
 * Command types supported by the CLI service
 */
enum CommandType
{
    CMD_GET,
    CMD_SET,
    CMD_INVALID
};

/**
 * Structure representing a parsed command
 */
struct ParsedCommand
{
    CommandType type;
    String action;
    String payload;
    bool isValid;
    String errorMessage;

    ParsedCommand() : type(CMD_INVALID), isValid(false) {}
};

class CommandParser
{
public:
    static ParsedCommand parse(const String &input);

private:
    static bool isValidCommandFormat(const String &input);
    static bool isValidAction(const String &action);
    static bool isValidType(const String &type);
    static CommandType parseCommandType(const String &typeStr);
};

#endif // COMMAND_PARSER_H