#pragma once

#include <iostream>

extern int failures;

#define CHECK(cond, message)                                                                                           \
    do                                                                                                                 \
    {                                                                                                                  \
        if (!(cond))                                                                                                   \
        {                                                                                                              \
            failures++;                                                                                                \
            std::cerr << "FAIL: " << message << " (" << #cond << ")\n";                                                \
        }                                                                                                              \
    } while (0)

void runSignedImageTests();
