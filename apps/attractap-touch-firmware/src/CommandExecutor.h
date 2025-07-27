#ifndef COMMAND_EXECUTOR_H
#define COMMAND_EXECUTOR_H

#include <Arduino.h>
#include <functional>
#include <map>

// Forward declaration
struct ParsedCommand;

typedef std::function<String(const String &)> CommandHandler;

class CommandExecutor
{
public:
    CommandExecutor();

    /**
     * Execute a parsed command
     * @param command The parsed command to execute
     * @return Response string from the command handler
     */
    String execute(const ParsedCommand &command);

    /**
     * Register a command handler for a specific action
     * @param action The action name
     * @param handler The handler function
     */
    void registerHandler(const String &action, CommandHandler handler);

private:
    std::map<String, CommandHandler> handlers;

    String handleGetCommand(const String &action, const String &payload);
    String handleSetCommand(const String &action, const String &payload);
};

#endif // COMMAND_EXECUTOR_H