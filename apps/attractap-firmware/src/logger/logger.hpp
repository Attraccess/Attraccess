#pragma once

#include <Arduino.h>
#include <cstdarg>

enum LogLevel
{
    LOG_LEVEL_ERROR, // 0 - Highest priority, always shown
    LOG_LEVEL_INFO,  // 1 - Medium priority
    LOG_LEVEL_DEBUG  // 2 - Lowest priority, only shown in debug mode
};

class Logger
{
public:
    Logger(const char *name);
    void log(const char *message);
    void logf(const char *message, ...);
    void info(const char *message);
    void infof(const char *message, ...);
    void error(const char *message);
    void errorf(const char *message, ...);
    void debug(const char *message);
    void debugf(const char *message, ...);

    static void setLevel(LogLevel level);

private:
    const char *name;
    static LogLevel level;

    String getLogLevelString(LogLevel level);
    LogLevel getLogLevelFromString(const char *level);

    void log(const char *message, LogLevel level);
    void logf(const char *message, LogLevel level, va_list args);
};