#include "logger.hpp"

LogLevel Logger::level = LOG_LEVEL_INFO;

Logger::Logger(const char *name) : name(name)
{
#ifdef LOG_LEVEL
    Logger::setLevel(getLogLevelFromString(LOG_LEVEL));
#endif
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

void Logger::setLevel(LogLevel level)
{
    Logger::level = level;
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

    this->logf(message, level, NULL);
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
