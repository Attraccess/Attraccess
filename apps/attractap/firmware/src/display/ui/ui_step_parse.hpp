#pragma once

// Parses and sanitizes a UI_STEP_REQUEST payload. Header-only so display-less readers (Lite card-confirm) can use it.

#include <ArduinoJson.h>

#include <string.h>

#include "ui_json.hpp"
#include "ui_step.hpp"
#include "ui_text.hpp"

namespace ui
{
    inline bool validStepId(const char *s)
    {
        if (!s || strlen(s) != 22) return false;
        for (const char *c = s; *c; c++)
        {
            const bool ok = (*c >= 'A' && *c <= 'Z') || (*c >= 'a' && *c <= 'z') || (*c >= '0' && *c <= '9') ||
                            *c == '-' || *c == '_';
            if (!ok) return false;
        }
        return true;
    }

    inline bool sanitizeInto(JsonVariantConst v, size_t maxChars, std::string &out, bool required)
    {
        const char *s = v.as<const char *>();
        if (!s) return !required;
        char buf[MAX_TEXT_CHARS * 2 * 2 + 1];
        if (strlen(s) >= sizeof buf) return false;
        const int chars = sanitizeLatin1(s, buf, sizeof buf);
        if (chars < 0 || static_cast<size_t>(chars) > maxChars) return false;
        out = buf;
        return true;
    }

    // Longest a step may stay open on the reader: the server's maximum plus its answer grace (pre-start), or the
    // post-stop maximum. A larger expiresAtMs would keep the step open, exempt from the action watchdog.
    constexpr int64_t STEP_MAX_OPEN_MS = (STEP_MAX_TTL_SEC + 5) * 1000LL;
    constexpr int64_t POST_STOP_MAX_OPEN_MS = POST_STOP_MAX_TTL_SEC * 1000LL;

    // Validates a step payload; false means the step is dropped (and never shown). A valid stepId and requestId
    // are kept in `out` even then, so the caller can tell the server it was dropped.
    inline bool parseStepRequest(JsonObjectConst p, uint32_t nowMillis, StepRequest &out)
    {
        out = StepRequest{};
        const char *stepId = cstr(field(p, "stepId"), nullptr);
        if (!validStepId(stepId)) return false;
        out.stepId = stepId;
        int64_t requestId = 0;
        if (int64Of(field(p, "requestId"), requestId) && requestId > 0 && requestId <= UINT32_MAX)
            out.requestId = static_cast<uint32_t>(requestId);
        const char *kind = cstr(field(p, "kind"));
        if (!strcmp(kind, "confirm")) out.kind = StepKind::Confirm;
        else if (!strcmp(kind, "choose")) out.kind = StepKind::Choose;
        else if (!strcmp(kind, "info")) out.kind = StepKind::Info;
        else if (!strcmp(kind, "card-confirm")) out.kind = StepKind::CardConfirm;
        else return false;
        int64_t resourceId = 0;
        if (!int64Of(field(p, "resourceId"), resourceId) || resourceId < 0 || resourceId > UINT32_MAX) return false;
        if (!int64Of(field(p, "serverNowMs"), out.serverNowMs) || !int64Of(field(p, "expiresAtMs"), out.expiresAtMs))
            return false;
        out.resourceId = static_cast<uint32_t>(resourceId);
        out.receivedAtMillis = nowMillis;
        // Server time is epoch ms: with serverNowMs >= 0 no difference to a positive timestamp can overflow.
        if (out.serverNowMs < 0 || out.expiresAtMs <= out.serverNowMs) return false;
        const int64_t maxOpenMs = out.requestId ? STEP_MAX_OPEN_MS : POST_STOP_MAX_OPEN_MS;
        if (out.expiresAtMs - out.serverNowMs > maxOpenMs) out.expiresAtMs = out.serverNowMs + maxOpenMs;
        if (!int64Of(field(p, "countdownToMs"), out.countdownToMs)) out.countdownToMs = 0;
        const char *tone = cstr(field(p, "tone"));
        out.tone = !strcmp(tone, "primary") ? 1 : !strcmp(tone, "success") ? 2 : !strcmp(tone, "warning") ? 3
                   : !strcmp(tone, "danger") ? 4 : 0;
        if (!sanitizeInto(field(p, "title"), MAX_TEXT_CHARS, out.title, true) || out.title.empty()) return false;
        if (!sanitizeInto(field(p, "body"), MAX_TEXT_CHARS * 2, out.body, false)) return false;
        JsonArrayConst actions = field(p, "actions").as<JsonArrayConst>();
        for (JsonVariantConst action : actions)
        {
            const char *role = cstr(field(action, "role"));
            std::string label;
            if (!sanitizeInto(field(action, "label"), MAX_LABEL_BYTES, label, false)) return false;
            if (!strcmp(role, "cancel")) out.cancelLabel = label;
            else if (!strcmp(role, "confirm") || !strcmp(role, "ok")) out.confirmLabel = label;
        }
        if (out.kind == StepKind::Choose)
        {
            if (!field(p, "choices").is<JsonArrayConst>()) return false;
            for (JsonVariantConst choice : field(p, "choices").as<JsonArrayConst>())
            {
                if (out.choiceCount >= MAX_CHOICES) return false;
                const char *id = cstr(field(choice, "id"));
                if (!*id || strlen(id) > MAX_ID_CHARS) return false;
                StepChoice &c = out.choices[out.choiceCount];
                c.id = id;
                if (!sanitizeInto(field(choice, "label"), MAX_LABEL_BYTES, c.label, true) || c.label.empty()) return false;
                out.choiceCount++;
            }
            if (out.choiceCount == 0) return false;
        }
        return true;
    }
}
