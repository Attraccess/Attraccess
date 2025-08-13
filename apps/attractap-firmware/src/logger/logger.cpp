#include "logger.hpp"
// Ensure we can safely convert macro values to strings
#ifndef STRINGIFY
#define STRINGIFY_HELPER(x) #x
#define STRINGIFY(x) STRINGIFY_HELPER(x)
#endif

LogLevel Logger::level = LOG_LEVEL_INFO;

Logger::Logger(const char *name) : name(name)
{
    Preferences preferences;
    preferences.begin("logging", true);
    bool hasLogLevel = preferences.isKey("log.level");

    if (hasLogLevel)
    {
        Serial.println("Logger: has persisted log level, restoring");
        LogLevel storedLogLevel = (LogLevel)preferences.getUChar("log.level", 0);
        Logger::setLevel(storedLogLevel, false);
    }
    else
    {
        Serial.println("Logger: no persisted log level, using LOG_LEVEL if exists");
#ifdef LOG_LEVEL
        Serial.println("Logger: LOG_LEVEL is defined, using it");
        const char *macroValue = STRINGIFY(LOG_LEVEL);

        // If macro expands to a quoted string (e.g. "INFO"), trim quotes.
        if (macroValue[0] == '"')
        {
            size_t length = strlen(macroValue);
            if (length >= 2 && macroValue[length - 1] == '"')
            {
                char trimmed[16];
                size_t copyLength = min((size_t)14, length - 2); // leave room for null terminator
                memcpy(trimmed, macroValue + 1, copyLength);
                trimmed[copyLength] = '\0';
                Logger::setLevel(getLogLevelFromString(trimmed));
            }
            else
            {
                Logger::setLevel(getLogLevelFromString(macroValue));
            }
        }
        else
        {
            // If macro expands to a bare token (e.g. INFO), STRINGIFY makes it "INFO"
            Logger::setLevel(getLogLevelFromString(macroValue));
        }
#else

        Serial.println("Logger: no persisted log level, no LOG_LEVEL, using LOG_LEVEL_INFO");
        Logger::setLevel(LOG_LEVEL_INFO, false);
#endif
    }
    preferences.end();
}

void Logger::log(const char *message)
{
    log(message, level);
}

void Logger::logf(const char *message, ...)
{
    va_list args;
    va_start(args, message);
    logf(message, Logger::level, args);
    va_end(args);
}

void Logger::info(const char *message)
{
    log(message, LOG_LEVEL_INFO);
}

void Logger::infof(const char *message, ...)
{
    va_list args;
    va_start(args, message);
    logf(message, LOG_LEVEL_INFO, args);
    va_end(args);
}

void Logger::error(const char *message)
{
    log(message, LOG_LEVEL_ERROR);
}

void Logger::errorf(const char *message, ...)
{
    va_list args;
    va_start(args, message);
    logf(message, LOG_LEVEL_ERROR, args);
    va_end(args);
}

void Logger::debug(const char *message)
{
    log(message, LOG_LEVEL_DEBUG);
}

void Logger::debugf(const char *message, ...)
{
    va_list args;
    va_start(args, message);
    logf(message, LOG_LEVEL_DEBUG, args);
    va_end(args);
}

void Logger::setLogLevel(String level, bool saveToPreferences)
{
    Logger::setLevel(getLogLevelFromString(level.c_str()), saveToPreferences);
}

void Logger::setLevel(LogLevel level, bool saveToPreferences)
{
    Logger::level = level;

    if (saveToPreferences)
    {
        Preferences preferences;
        preferences.begin("logging", false);
        preferences.putUChar("log.level", level);
        preferences.end();
    }
}

String Logger::getLogLevelString(LogLevel level)
{
    switch (level)
    {
    case LOG_LEVEL_ERROR:
        return "ERROR";
    case LOG_LEVEL_INFO:
        return "INFO";
    case LOG_LEVEL_DEBUG:
        return "DEBUG";
    }
    return "UNKNOWN";
}

LogLevel Logger::getLogLevelFromString(const char *level)
{
    if (strcmp(level, "ERROR") == 0)
    {
        return LOG_LEVEL_ERROR;
    }
    else if (strcmp(level, "INFO") == 0)
    {
        return LOG_LEVEL_INFO;
    }
    else if (strcmp(level, "DEBUG") == 0)
    {
        return LOG_LEVEL_DEBUG;
    }

    return LOG_LEVEL_INFO; // default fallback
}

void Logger::log(const char *message, LogLevel level)
{
    if (level > Logger::level)
    {
        return;
    }
    // Use a safe, non-variadic path to avoid undefined behavior from a NULL va_list
    Serial.print("[");
    Serial.print(name);
    Serial.print("] ");
    Serial.print(getLogLevelString(level));
    Serial.print(": ");
    Serial.println(message);
}

void Logger::logf(const char *message, LogLevel level, va_list args)
{
    if (level > Logger::level)
    {
        return;
    }

    char buffer[512];
    vsnprintf(buffer, sizeof(buffer), message, args);

    Serial.print("[");
    Serial.print(name);
    Serial.print("] ");
    Serial.print(getLogLevelString(level));
    Serial.print(": ");
    Serial.println(buffer);
}
