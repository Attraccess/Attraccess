#pragma once

#include <ArduinoJson.h>
#include <string>
#include "../api_types.hpp"
#include "../../text/utf8_copy.hpp"

// The name a screen shows for a user: the server's display name, or the username when it sends none
// (an older server). Cut to the display-name buffers in whole UTF-8 characters. Display only: identity
// checks keep using the username.
inline std::string displayNameOr(JsonVariantConst displayName, const std::string &username)
{
    const char *name = displayName.is<const char *>() ? displayName.as<const char *>() : nullptr;
    return utf8Prefix(name && name[0] != '\0' ? name : username.c_str(), ApiResources::MAX_DISPLAY_NAME_LEN - 1);
}
