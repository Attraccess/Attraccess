#pragma once

// Out-of-line JSON accessors shared by the UI parsers.

#include <ArduinoJson.h>

namespace ui
{
    // One out-of-line instantiation of each JSON accessor: the member-proxy templates cost ~100 B per call site.
    [[gnu::noinline]] inline JsonVariantConst field(JsonVariantConst o, const char *key) { return o[key]; }
    [[gnu::noinline]] inline const char *cstr(JsonVariantConst v, const char *fallback = "")
    {
        const char *s = v.as<const char *>();
        return s ? s : fallback;
    }
    [[gnu::noinline]] inline bool int64Of(JsonVariantConst v, int64_t &out)
    {
        if (!v.is<int64_t>()) return false;
        out = v.as<int64_t>();
        return true;
    }
}
