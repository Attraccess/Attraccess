#pragma once

#include <ArduinoJson.h>
#include <string>
#include <vector>
#include "../api_types.hpp"
#include "../../text/utf8_copy.hpp"

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

// The names shown for parseResourceIntroducers(usernames): same order and same entries, so the two
// lists stay aligned. A missing or empty display name shows the username; each name is cut to the
// display-name buffer (whole UTF-8 characters). Empty (show the usernames) when the server sent no
// display names or a list of another length.
inline std::vector<std::string> parseIntroducerDisplayNames(JsonArrayConst usernames, JsonArrayConst displayNames)
{
    std::vector<std::string> result;
    if (displayNames.isNull() || displayNames.size() != usernames.size()) return result;
    result.reserve(usernames.size());
    auto shown = displayNames.begin();
    for (JsonVariantConst value : usernames)
    {
        JsonVariantConst displayName = *shown;
        ++shown;
        const char *username = value.is<const char *>() ? value.as<const char *>() : nullptr;
        if (!username || username[0] == '\0') continue;
        const char *name = displayName.is<const char *>() ? displayName.as<const char *>() : nullptr;
        result.push_back(utf8Prefix(name && name[0] != '\0' ? name : username, ApiResources::MAX_DISPLAY_NAME_LEN - 1));
    }
    return result;
}
