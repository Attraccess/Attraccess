#pragma once

// Flat, fixed-capacity record of one reader UI slot contribution (schema v1).
// Parsed once on the task that dispatches inbound messages and then cached, so nothing refers back to the
// inbound JSON document. The LVGL builder (ui_builder.cpp) turns it into objects under lv_lock().
// Hardware-free: host tests in tests/ui-schema parse the shared fixtures with it.

#include <ArduinoJson.h>

#include <stddef.h>
#include <stdint.h>

#include "ui_schema.hpp"

namespace ui
{
    enum class NodeType : uint8_t { Col, Row, Text, Badge, Icon, Button, Progress, Countdown, Spacer };
    enum class Tone : uint8_t { None, Primary, Success, Warning, Danger };
    enum class TextStyle : uint8_t { Body, Title, Small };
    enum class Icon : uint8_t { Ok, Warning, Bell, Lock, Clock };
    enum class SlotId : uint8_t { ListRowStatus, DetailsHeader, DetailsBody, DetailsSession, Count, Unknown = 0xFF };

    enum class Verdict : uint8_t
    {
        Accept,
        InvalidShape,
        UnknownSlot,
        UnknownComponent,
        BadEnum,
        TooManyNodes,
        TooDeep,
        SlotBudget,
        PayloadTooLarge,
        TextTooLong,
        BadId,
        CoreStringSpoof,
        DangerLock,
        ButtonInSlot,
        TooManyChoices,
    };

    constexpr uint8_t NO_PARENT = 0xFF;
    // All strings of a record live here; the payload cap (3072 B) bounds the sum of text bytes.
    constexpr size_t POOL_BYTES = 2048;

    struct Node
    {
        NodeType type;
        uint8_t parent;
        Tone tone;
        TextStyle style;
        Icon icon;
        bool secondary; // button variant
        bool fill;
        uint8_t gap;
        uint8_t pad;
        uint8_t height; // spacer
        uint8_t value;  // progress 0..100
        uint16_t textOffset;
        uint16_t textLen;
        int64_t toMs; // countdown target, epoch ms on the server clock
    };

    struct SlotRecord
    {
        bool removal;
        SlotId slot;
        uint8_t nodeCount;
        uint16_t poolUsed;
        uint32_t resourceId;
        uint32_t revision;
        char key[MAX_ID_CHARS + 1];
        int64_t serverNowMs;
        int64_t expiresAtMs; // 0 = none
        uint32_t receivedAtMillis;
        Node nodes[MAX_NODES];
        char pool[POOL_BYTES];

        const char *text(const Node &node) const { return pool + node.textOffset; }
    };

    const char *verdictName(Verdict v);
    SlotId slotFromName(const char *name);
    int slotNodeBudget(SlotId slot);

    // Rewrites UTF-8 `in` into `out` keeping only glyphs the Latin-1 fonts have (0x20-0x7E, 0xA0-0xFF);
    // everything else becomes '?', control characters a space. Returns the number of code points written,
    // or -1 when `out` is too small.
    int sanitizeLatin1(const char *in, char *out, size_t outCap);

    // Validates a UI_SLOT_UPDATE payload against the schema and flattens it into `out`.
    // `payloadBytes` is the serialized size of the payload (the 3072 B limit applies to it).
    Verdict parseSlotUpdate(JsonObjectConst payload, size_t payloadBytes, SlotRecord &out);

    // True when text matches a string only the host may show (core status).
    bool isCoreStatusString(const char *text);
}
