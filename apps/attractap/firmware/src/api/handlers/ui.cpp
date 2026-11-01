// Reader UI messages (ATT-1187): plugin slot updates, host-owned steps, block reasons, card sessions.
// FEATURE: api-ui

#include "../api.hpp"
#include "../../display/ui/ui_step_parse.hpp"
#include "../../display/ui/ui_text.hpp"
#include "../../platform.hpp"

#ifdef HAS_LVGL_DISPLAY
#include "../../display/ui/ui_slots.hpp"
#endif

void API::readBlockReason(JsonVariantConst reason, ActionResult &out)
{
    char buf[ui::MAX_TEXT_CHARS * 2 * 2 + 1];
    auto take = [&](JsonVariantConst v, std::string &dst) {
        const char *s = v.is<const char *>() ? v.as<const char *>() : nullptr;
        if (s && strlen(s) < sizeof buf && ui::sanitizeLatin1(s, buf, sizeof buf) >= 0) dst = buf;
    };
    take(reason["code"], out.blockCode);
    take(reason["title"], out.blockTitle);
    take(reason["body"], out.blockBody);
}

void API::onUiSlotUpdate(JsonObject data)
{
#ifdef HAS_LVGL_DISPLAY
    JsonObject payload = data["payload"].as<JsonObject>();
    if (!uiSlotScratch) uiSlotScratch = ui::allocRecord();
    if (!uiSlotScratch)
    {
        logger.error("No memory for UI slot scratch record");
        return;
    }
    ui::SlotRecord &rec = *static_cast<ui::SlotRecord *>(uiSlotScratch);
    const uint32_t resourceId = payload["resourceId"] | 0u;
    const char *slot = payload["slot"].is<const char *>() ? payload["slot"].as<const char *>() : "";
    const char *key = payload["key"].is<const char *>() ? payload["key"].as<const char *>() : "";
    const ui::Verdict verdict = ui::parseSlotUpdate(payload, measureJson(payload), rec);
    if (verdict != ui::Verdict::Accept)
    {
        // Only this contribution is dropped; everything else keeps rendering.
        logger.error((std::string("Dropping UI slot update: ") + ui::verdictName(verdict)).c_str());
        sendUiRenderReport(resourceId, slot, key, false, ui::verdictName(verdict));
        return;
    }
    switch (ui::slotCache().apply(rec, millis()))
    {
    case ui::ApplyResult::Applied:
    case ui::ApplyResult::Removed:
        sendUiRenderReport(resourceId, slot, key, !rec.removal, rec.removal ? "removed" : nullptr);
        if (uiSlotsChangedCallback) uiSlotsChangedCallback();
        break;
    case ui::ApplyResult::Stale:
    case ui::ApplyResult::NoSuchEntry:
        break; // still acked by the generic path
    case ui::ApplyResult::CapacityFull:
        sendUiRenderReport(resourceId, slot, key, false, "capacity");
        break;
    case ui::ApplyResult::LiveNodesExceeded:
        sendUiRenderReport(resourceId, slot, key, false, "live-nodes");
        break;
    }
#else
    (void)data; // readers without a screen render nothing
#endif
}

void API::onUiStepRequest(JsonObject data)
{
    if (!uiStepRequestCallback) return;
    if (!ui::parseStepRequest(data["payload"].as<JsonObjectConst>(), millis(), uiStepScratch))
    {
        logger.error("Dropping invalid UI step request");
        return;
    }
    uiStepRequestCallback(uiStepScratch);
}

void API::onUiStepCancel(JsonObject data)
{
    const char *stepId = data["payload"]["stepId"].is<const char *>() ? data["payload"]["stepId"].as<const char *>() : nullptr;
    if (stepId && uiStepCancelCallback) uiStepCancelCallback(stepId);
}

void API::sendUiStepResult(const char *stepId, const char *action)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["stepId"] = stepId;
    payload["action"] = action;
    if (!cardSessionId.empty()) payload["cardSessionId"] = cardSessionId;
    this->sendMessage("UI_STEP_RESULT", payload);
}

void API::sendUiRenderReport(uint32_t resourceId, const char *slot, const char *key, bool rendered, const char *reason)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["slot"] = slot;
    payload["key"] = key;
    payload["status"] = rendered ? "rendered" : "skipped";
    if (reason) payload["reason"] = reason;
    this->sendMessage("UI_RENDER_REPORT", payload);
}

void API::clearUiSlots()
{
    uiReplies.clear(); // answers to the previous connection are pointless
#ifdef HAS_LVGL_DISPLAY
    ui::slotCache().clear();
    if (uiSlotsChangedCallback) uiSlotsChangedCallback();
#endif
}

void API::endCardSession()
{
    if (cardSessionId.empty()) return;
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["cardSessionId"] = cardSessionId;
    this->sendMessage("CARD_SESSION_ENDED", payload);
    cardSessionId.clear();
}
