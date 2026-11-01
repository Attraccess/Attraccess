#pragma once

// `capabilities.ui` of READER_FIRMWARE_INFO per variant. Touch readers render the schema; Lite readers
// (LED ring, no screen) report no display, no components and no slots.

#include <ArduinoJson.h>

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

    inline void fillCapabilitiesUi(JsonObject ui, const VariantTraits &v)
    {
        ui["schemaVersion"] = SCHEMA_VERSION;
        JsonArray components = ui["components"].to<JsonArray>();
        JsonArray slots = ui["slots"].to<JsonArray>();
        JsonArray steps = ui["steps"].to<JsonArray>();
        if (v.hasDisplay)
        {
            for (const char *c : {"col", "row", "text", "badge", "icon", "button", "progress", "countdown", "spacer"})
                components.add(c);
            for (const char *s : {SLOT_LIST_ROW_STATUS, SLOT_DETAILS_HEADER, SLOT_DETAILS_BODY, SLOT_DETAILS_SESSION})
                slots.add(s);
            for (const char *s : {"confirm", "choose", "info"})
                steps.add(s);
            ui["maxPayloadBytes"] = static_cast<unsigned>(MAX_PAYLOAD_BYTES);
            ui["maxNodes"] = MAX_NODES;
            ui["maxDepth"] = MAX_DEPTH;
            ui["maxLiveNodes"] = MAX_LIVE_NODES;
            JsonObject display = ui["display"].to<JsonObject>();
            display["w"] = v.displayWidth;
            display["h"] = v.displayHeight;
            display["touch"] = v.touch;
        }
        else
        {
            if (v.cardConfirm) steps.add("card-confirm");
            ui["maxPayloadBytes"] = 0;
            ui["maxNodes"] = 0;
            ui["maxDepth"] = 0;
            ui["maxLiveNodes"] = 0;
            ui["display"] = nullptr;
        }
        JsonObject input = ui["input"].to<JsonObject>();
        input["touch"] = v.hasDisplay && v.touch;
        input["buttons"] = 0;
        input["cardHold"] = true;
        JsonObject feedback = ui["feedback"].to<JsonObject>();
        feedback["leds"] = v.hasLeds;
        feedback["beeper"] = v.hasBeeper;
        ui["charset"] = "latin1";
        ui["images"] = false;
    }
}
