#pragma once

// `capabilities.ui` of READER_FIRMWARE_INFO per variant. Touch readers render the schema; Lite readers
// (LED ring, no screen) report no display, no components and no slots.

#include <ArduinoJson.h>
#include <stdio.h>

#include "ui_schema.hpp"

namespace ui
{
    struct VariantTraits
    {
        bool hasDisplay;
        bool touch;
        bool hasLeds;
        bool hasBeeper;
        // Lite: second short tap by the same user confirms a plugin step.
        bool cardConfirm;
        int displayWidth;
        int displayHeight;
    };

    // Rendered as text, then spliced in as raw JSON: ArduinoJson's per-field template code cost ~2.5 KB of flash.
    // `scratch` must outlive the serialization of `caps`; 640 B covers the Touch payload.
    constexpr size_t CAPABILITIES_UI_SCRATCH = 640;

    inline void fillCapabilitiesUi(JsonObject caps, const VariantTraits &v, char *scratch, size_t n)
    {
        char display[64] = "null";
        char slots[160] = "";
        const char *components = "";
        const char *steps = v.cardConfirm ? "\"card-confirm\"" : "";
        if (v.hasDisplay)
        {
            snprintf(display, sizeof display, "{\"w\":%d,\"h\":%d,\"touch\":%s}", v.displayWidth, v.displayHeight,
                     v.touch ? "true" : "false");
            snprintf(slots, sizeof slots, "\"%s\",\"%s\",\"%s\",\"%s\"", SLOT_LIST_ROW_STATUS, SLOT_DETAILS_HEADER,
                     SLOT_DETAILS_BODY, SLOT_DETAILS_SESSION);
            components = "\"col\",\"row\",\"text\",\"badge\",\"icon\",\"button\",\"progress\",\"countdown\",\"spacer\"";
            steps = "\"confirm\",\"choose\",\"info\"";
        }
        const unsigned payload = v.hasDisplay ? static_cast<unsigned>(MAX_PAYLOAD_BYTES) : 0;
        snprintf(scratch, n,
                 "{\"schemaVersion\":%d,\"components\":[%s],\"slots\":[%s],\"steps\":[%s],"
                 "\"maxPayloadBytes\":%u,\"maxNodes\":%d,\"maxDepth\":%d,\"maxLiveNodes\":%d,\"display\":%s,"
                 "\"input\":{\"touch\":%s,\"buttons\":0,\"cardHold\":true},"
                 "\"feedback\":{\"leds\":%s,\"beeper\":%s},\"charset\":\"latin1\",\"images\":false}",
                 SCHEMA_VERSION, components, slots, steps, payload, v.hasDisplay ? MAX_NODES : 0,
                 v.hasDisplay ? MAX_DEPTH : 0, v.hasDisplay ? MAX_LIVE_NODES : 0, display,
                 v.hasDisplay && v.touch ? "true" : "false", v.hasLeds ? "true" : "false",
                 v.hasBeeper ? "true" : "false");
        caps["ui"] = serialized(scratch);
    }
}
