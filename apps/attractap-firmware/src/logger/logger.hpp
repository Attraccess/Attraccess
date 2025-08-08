#pragma once

#include <Arduino.h>
#include <cstdarg>
#include <Preferences.h>

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

    static void setLogLevel(String level, bool saveToPreferences = true);
    static void setLevel(LogLevel level, bool saveToPreferences = true);

private:
    const char *name;
    static LogLevel level;

    static String getLogLevelString(LogLevel level);
    static LogLevel getLogLevelFromString(const char *level);

    void log(const char *message, LogLevel level);
    void logf(const char *message, LogLevel level, va_list args);
};