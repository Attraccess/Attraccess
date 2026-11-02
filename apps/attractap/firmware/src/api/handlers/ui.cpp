// Reader UI messages (ATT-1187): plugin slot updates, host-owned steps, block reasons, card sessions.
// FEATURE: api-ui

#include "../api.hpp"
#include "../../display/ui/ui_step_parse.hpp"
#include "../../display/ui/ui_text.hpp"
#include "../../platform.hpp"

#include <cstring>

#ifdef HAS_LVGL_DISPLAY
#include "../../display/ui/ui_slots.hpp"
#endif

void API::readBlockReason(JsonVariantConst reason, ActionResult &out)
{
    char buf[ui::MAX_TEXT_CHARS * 2 * 2 + 1];
    auto take = [&](JsonVariantConst v, std::string &dst) {
        const char *s = ui::cstr(v, nullptr);
        if (s && strlen(s) < sizeof buf && ui::sanitizeLatin1(s, buf, sizeof buf) >= 0) dst = buf;
    };
    take(ui::field(reason, "code"), out.blockCode);
    take(ui::field(reason, "title"), out.blockTitle);
    take(ui::field(reason, "body"), out.blockBody);
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
    const ui::Verdict verdict = ui::parseSlotUpdate(payload, measureJson(payload), rec);
    if (verdict != ui::Verdict::Accept)
    {
        // Only this contribution is dropped; everything else keeps rendering.
        logger.error((std::string("Dropping UI slot update: ") + ui::verdictName(verdict)).c_str());
        reportUiSkip(payload, ui::verdictName(verdict));
        return;
    }
    // Stale and unknown removals are still acked by the generic path; only skips are reported.
    switch (ui::slotCache().apply(rec, millis()))
    {
    case ui::ApplyResult::Applied:
    case ui::ApplyResult::Removed:
        if (uiSlotsChangedCallback) uiSlotsChangedCallback();
        break;
    case ui::ApplyResult::CapacityFull:
        reportUiSkip(payload, "capacity");
        break;
    case ui::ApplyResult::LiveNodesExceeded:
        reportUiSkip(payload, "live-nodes");
        break;
    default:
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
        if (uiStepScratch.stepId.empty()) return;
        uiStepScratch.dropped = true; // the application tells the server and ends a START it holds
    }
    uiStepRequestCallback(uiStepScratch);
}

void API::onUiStepCancel(JsonObject data)
{
    const char *stepId = ui::cstr(ui::field(ui::field(data, "payload"), "stepId"), nullptr);
    if (stepId && uiStepCancelCallback) uiStepCancelCallback(stepId);
}

void API::sendUiStepResult(const char *stepId, const char *action)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["stepId"] = stepId;
    payload["action"] = action;
    CardSessionIdBuf cardSession;
    if (copyCardSessionId(cardSession)) payload["cardSessionId"] = cardSession;
    this->sendMessage("UI_STEP_RESULT", payload);
}

void API::reportUiSkip(JsonObjectConst payload, const char *reason)
{
    UiRenderReport report{};
    report.resourceId = ui::field(payload, "resourceId").as<uint32_t>();
    report.revision = ui::field(payload, "revision").as<uint32_t>();
    snprintf(report.owner, sizeof report.owner, "%s", ui::cstr(ui::field(payload, "owner")));
    snprintf(report.slot, sizeof report.slot, "%s", ui::cstr(ui::field(payload, "slot")));
    snprintf(report.key, sizeof report.key, "%s", ui::cstr(ui::field(payload, "key")));
    snprintf(report.reason, sizeof report.reason, "%s", reason);
    if (!deferUiReply(nullptr, 0, &report)) sendUiRenderReport(report);
}

void API::sendUiRenderReport(const UiRenderReport &report)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = report.resourceId;
    payload["slot"] = report.slot;
    payload["owner"] = report.owner;
    payload["key"] = report.key;
    payload["revision"] = report.revision;
    payload["status"] = "skipped";
    payload["reason"] = report.reason;
    this->sendMessage("UI_RENDER_REPORT", payload);
}

void API::clearUiSlots()
{
    portENTER_CRITICAL(&uiReplyLock);
    uiAckCount = uiReportCount = 0; // answers to the previous connection are pointless
    portEXIT_CRITICAL(&uiReplyLock);
#ifdef HAS_LVGL_DISPLAY
    ui::slotCache().clear();
    if (uiSlotsChangedCallback) uiSlotsChangedCallback();
#endif
}

void API::endCardSession()
{
    CardSessionIdBuf cardSession;
    if (!takeCardSessionId(cardSession)) return;
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["cardSessionId"] = cardSession;
    this->sendMessage("CARD_SESSION_ENDED", payload);
}

// Fixed-size copies only: no allocation or logging inside the critical section.
void ApiUiState::setCardSessionId(const char *id)
{
    CardSessionIdBuf next = {};
    const size_t len = id ? strnlen(id, CARD_SESSION_ID_MAX + 1) : 0;
    if (len <= CARD_SESSION_ID_MAX && len > 0) memcpy(next, id, len);
    portENTER_CRITICAL(&uiReplyLock);
    memcpy(cardSessionId, next, sizeof next);
    portEXIT_CRITICAL(&uiReplyLock);
}

bool ApiUiState::copyCardSessionId(CardSessionIdBuf &out)
{
    portENTER_CRITICAL(&uiReplyLock);
    memcpy(out, cardSessionId, sizeof out);
    portEXIT_CRITICAL(&uiReplyLock);
    return out[0] != '\0';
}

bool ApiUiState::takeCardSessionId(CardSessionIdBuf &out)
{
    portENTER_CRITICAL(&uiReplyLock);
    memcpy(out, cardSessionId, sizeof out);
    cardSessionId[0] = '\0';
    portEXIT_CRITICAL(&uiReplyLock);
    return out[0] != '\0';
}

// UI reply pacing (see ApiUiState): the inbound-dispatch task queues, the main task drains, uiReplyLock guards both.
bool ApiUiState::deferUiReply(const char *ackType, uint32_t messageId, const UiRenderReport *report)
{
    const uint32_t nowMs = millis();
    bool queued = true;
    portENTER_CRITICAL(&uiReplyLock);
    if (nowMs - uiReplyWindowStartMs >= UI_REPLY_WINDOW_MS)
    {
        uiReplyWindowStartMs = nowMs;
        uiReplyWindowCount = 0;
    }
    if (uiAckCount == 0 && uiReportCount == 0 && uiReplyWindowCount < UI_REPLY_BURST)
    {
        uiReplyWindowCount++;
        uiReplyLastMs = nowMs;
        queued = false;
    }
    else if (report)
    {
        // A full report queue drops the new report; acks have their own queue.
        if (uiReportCount < UI_REPORT_QUEUE_MAX)
            uiReports[(uiReportHead + uiReportCount++) % UI_REPORT_QUEUE_MAX] = *report;
    }
    else
    {
        if (uiAckCount == UI_ACK_QUEUE_MAX)
        {
            uiAckHead = (uiAckHead + 1) % UI_ACK_QUEUE_MAX; // drop the oldest: the server resends unacked updates
            uiAckCount--;
        }
        DeferredUiAck &ack = uiAcks[(uiAckHead + uiAckCount++) % UI_ACK_QUEUE_MAX];
        strncpy(ack.type, ackType, sizeof ack.type - 1);
        ack.type[sizeof ack.type - 1] = '\0';
        ack.messageId = messageId;
    }
    portEXIT_CRITICAL(&uiReplyLock);
    return queued;
}

int ApiUiState::takeDueUiReply(DeferredUiAck &ack, UiRenderReport &report)
{
    int due = 0;
    const uint32_t nowMs = millis();
    portENTER_CRITICAL(&uiReplyLock);
    if (nowMs - uiReplyLastMs >= UI_REPLY_SPACING_MS)
    {
        if (uiAckCount > 0)
        {
            ack = uiAcks[uiAckHead];
            uiAckHead = (uiAckHead + 1) % UI_ACK_QUEUE_MAX;
            uiAckCount--;
            due = 1;
        }
        else if (uiReportCount > 0)
        {
            report = uiReports[uiReportHead];
            uiReportHead = (uiReportHead + 1) % UI_REPORT_QUEUE_MAX;
            uiReportCount--;
            due = 2;
        }
        if (due) uiReplyLastMs = nowMs;
    }
    portEXIT_CRITICAL(&uiReplyLock);
    return due;
}
