#pragma once

#include <ArduinoJson.h>
#include <string>
#include <vector>

inline std::vector<std::string> parseResourceIntroducers(JsonArrayConst introducers)
{
    std::vector<std::string> result;
    result.reserve(introducers.size());
    for (JsonVariantConst value : introducers)
    {
        const char *name = value.is<const char *>() ? value.as<const char *>() : nullptr;
        if (name && name[0] != '\0') result.emplace_back(name);
    }
    return result;
}
