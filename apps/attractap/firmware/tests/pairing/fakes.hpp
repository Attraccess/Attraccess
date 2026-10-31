#pragma once

#include <cstdint>
#include <string>

struct FakeEnrollment
{
    int rounds = 0;
    std::string code;
    std::string appUrl;
    bool hasPattern = false;
    uint8_t pattern[8] = {};
    uint32_t rotatesInMs = 0;
    uint32_t expiresInMs = 0;
    bool lite = false;
    int disconnected = 0;
    int outcome = 0;
    int requested = 0;
};

extern FakeEnrollment fakeEnrollment;
