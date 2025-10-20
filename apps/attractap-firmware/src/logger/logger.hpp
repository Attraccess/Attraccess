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
// Compile-time gating for non-error levels to avoid overhead in production
#ifndef LOGGER_LEVEL_NUM
#ifdef LOG_LEVEL_NUM
#define LOGGER_LEVEL_NUM LOG_LEVEL_NUM
#else
#define LOGGER_LEVEL_NUM 1
#endif
#endif

#if LOGGER_LEVEL_NUM >= 1
    void info(const char *message);
    void infof(const char *message, ...);
#else
    void info(const char *) {}
    void infof(const char *, ...) {}
#endif
    void error(const char *message);
    void errorf(const char *message, ...);
#if LOGGER_LEVEL_NUM >= 2
    void debug(const char *message);
    void debugf(const char *message, ...);
#else
    void debug(const char *) {}
    void debugf(const char *, ...) {}
#endif

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