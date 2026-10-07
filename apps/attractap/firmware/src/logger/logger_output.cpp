#include "logger.hpp"
#include <string>
#include <cstdio>
#include <cstring>
#include <algorithm>
#include <memory>
#include <new>

void Logger::log(const char *message, LogLevel level)
{
    if (level > Logger::level)
    {
        return;
    }
    // Use a safe, non-variadic path to avoid undefined behavior from a NULL va_list
    printf("[%s] %s: %s\n", name, getLogLevelString(level), message);
}

void Logger::logf(const char *message, LogLevel level, va_list args)
{
    if (level > Logger::level)
    {
        return;
    }

    va_list measureArgs;
    va_copy(measureArgs, args);
    int required = vsnprintf(nullptr, 0, message, measureArgs);
    va_end(measureArgs);
    if (required < 0)
    {
        return;
    }

    size_t bufferSize = static_cast<size_t>(required) + 1;
    std::unique_ptr<char[]> heapBuffer(new (std::nothrow) char[bufferSize]);

    if (heapBuffer)
    {
        va_list formatArgs;
        va_copy(formatArgs, args);
        vsnprintf(heapBuffer.get(), bufferSize, message, formatArgs);
        va_end(formatArgs);

        printf("[%s] %s: %s\n", name, getLogLevelString(level), heapBuffer.get());
        return;
    }

    // Fallback to a small stack buffer if heap allocation fails
    char fallback[128];
    va_list fallbackArgs;
    va_copy(fallbackArgs, args);
    vsnprintf(fallback, sizeof(fallback), message, fallbackArgs);
    va_end(fallbackArgs);

    printf("[%s] %s: %s\n", name, getLogLevelString(level), fallback);
}
