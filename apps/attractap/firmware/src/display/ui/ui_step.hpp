#pragma once

// UI_STEP_REQUEST payload types (schema v1): a host-owned confirm / choose / info step, or the post-stop
// question (requestId 0). No JSON here, so screens and api.hpp can include it; parsing is in ui_step_parse.hpp.

#include <stdint.h>
#include <string>

#include "ui_schema.hpp"

namespace ui
{
    // CardConfirm: Lite readers confirm with a second short card tap (no screen).
    enum class StepKind : uint8_t { Confirm, Choose, Info, CardConfirm };
    enum class StepRole : uint8_t { Cancel, Confirm, Ok };

    struct StepChoice
    {
        std::string id;
        std::string label;
    };

    struct StepRequest
    {
        uint32_t requestId = 0; // 0: post-stop question, no START to retry
        std::string stepId;
        bool dropped = false; // failed validation: only stepId and requestId are set, the step is refused
        StepKind kind = StepKind::Confirm;
        uint32_t resourceId = 0;
        int64_t serverNowMs = 0;
        int64_t expiresAtMs = 0;
        int64_t countdownToMs = 0; // 0 = none
        uint32_t receivedAtMillis = 0;
        uint8_t tone = 0; // 0 none, 1 primary, 2 success, 3 warning, 4 danger
        std::string title;
        std::string body;
        std::string cancelLabel;  // empty = catalog label for the role
        std::string confirmLabel; // empty = catalog label for the role
        uint8_t choiceCount = 0;
        StepChoice choices[MAX_CHOICES];

        // Milliseconds left until the step expires (millis() deltas, not the wall clock).
        int64_t remainingMs(uint32_t nowMillis) const
        {
            return (expiresAtMs - serverNowMs) - static_cast<int64_t>(static_cast<uint32_t>(nowMillis - receivedAtMillis));
        }
    };
}
