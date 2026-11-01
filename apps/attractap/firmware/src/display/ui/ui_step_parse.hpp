#pragma once

// Parses and sanitizes a UI_STEP_REQUEST payload. Header-only so display-less readers (Lite card-confirm) can use it.

#include <ArduinoJson.h>

#include <string.h>

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
        const char *s = v.is<const char *>() ? v.as<const char *>() : nullptr;
        if (!s) return !required;
        char buf[MAX_TEXT_CHARS * 2 * 2 + 1];
        if (strlen(s) >= sizeof buf) return false;
        const int chars = sanitizeLatin1(s, buf, sizeof buf);
        if (chars < 0 || static_cast<size_t>(chars) > maxChars) return false;
        out = buf;
        return true;
    }

    // Validates a step payload; false means the step is dropped (and never shown).
    inline bool parseStepRequest(JsonObjectConst p, uint32_t nowMillis, StepRequest &out)
    {
        out = StepRequest{};
        const char *stepId = p["stepId"].is<const char *>() ? p["stepId"].as<const char *>() : nullptr;
        if (!validStepId(stepId)) return false;
        out.stepId = stepId;
        const char *kind = p["kind"].is<const char *>() ? p["kind"].as<const char *>() : "";
        if (!strcmp(kind, "confirm")) out.kind = StepKind::Confirm;
        else if (!strcmp(kind, "choose")) out.kind = StepKind::Choose;
        else if (!strcmp(kind, "info")) out.kind = StepKind::Info;
        else if (!strcmp(kind, "card-confirm")) out.kind = StepKind::CardConfirm;
        else return false;
        if (!p["resourceId"].is<uint32_t>() || !p["serverNowMs"].is<int64_t>() || !p["expiresAtMs"].is<int64_t>())
            return false;
        out.requestId = p["requestId"] | 0u;
        out.resourceId = p["resourceId"].as<uint32_t>();
        out.serverNowMs = p["serverNowMs"].as<int64_t>();
        out.expiresAtMs = p["expiresAtMs"].as<int64_t>();
        out.receivedAtMillis = nowMillis;
        if (out.expiresAtMs <= out.serverNowMs) return false;
        out.countdownToMs = p["countdownToMs"].is<int64_t>() ? p["countdownToMs"].as<int64_t>() : 0;
        const char *tone = p["tone"].is<const char *>() ? p["tone"].as<const char *>() : "";
        out.tone = !strcmp(tone, "primary") ? 1 : !strcmp(tone, "success") ? 2 : !strcmp(tone, "warning") ? 3
                   : !strcmp(tone, "danger") ? 4 : 0;
        if (!sanitizeInto(p["title"], MAX_TEXT_CHARS, out.title, true) || out.title.empty()) return false;
        if (!sanitizeInto(p["body"], MAX_TEXT_CHARS * 2, out.body, false)) return false;
        if (p["actions"].is<JsonArrayConst>())
        {
            for (JsonObjectConst action : p["actions"].as<JsonArrayConst>())
            {
                const char *role = action["role"].is<const char *>() ? action["role"].as<const char *>() : "";
                std::string label;
                if (!sanitizeInto(action["label"], MAX_LABEL_BYTES, label, false)) return false;
                if (!strcmp(role, "cancel")) out.cancelLabel = label;
                else if (!strcmp(role, "confirm") || !strcmp(role, "ok")) out.confirmLabel = label;
            }
        }
        if (out.kind == StepKind::Choose)
        {
            if (!p["choices"].is<JsonArrayConst>()) return false;
            for (JsonObjectConst choice : p["choices"].as<JsonArrayConst>())
            {
                if (out.choiceCount >= MAX_CHOICES) return false;
                const char *id = choice["id"].is<const char *>() ? choice["id"].as<const char *>() : "";
                if (!*id || strlen(id) > MAX_ID_CHARS) return false;
                StepChoice &c = out.choices[out.choiceCount];
                c.id = id;
                if (!sanitizeInto(choice["label"], MAX_LABEL_BYTES, c.label, true) || c.label.empty()) return false;
                out.choiceCount++;
            }
            if (out.choiceCount == 0) return false;
        }
        return true;
    }
}
