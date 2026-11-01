#pragma once

// Reader UI state held by the API object (ATT-1187): step and slot callbacks, the card session id and scratch
// space for inbound UI messages. Kept out of api.hpp to stay under the file size limit.

#include <deque>
#include <functional>
#include <string>
#ifdef ATTRACTAP_UI_SELFTEST
#include <mutex>
#endif

#include "freertos/FreeRTOS.h"

#include "../display/ui/ui_step.hpp"

struct ApiUiState
{
protected:
    // Step callbacks run on the inbound-dispatch task; the application hands over to LvglTask.
    std::function<void(const ui::StepRequest &)> uiStepRequestCallback;
    std::function<void(const std::string &stepId)> uiStepCancelCallback;
    std::function<void()> uiSlotsChangedCallback;
    ui::StepRequest uiStepScratch;
    void *uiSlotScratch = nullptr; // ui::SlotRecord in PSRAM, display readers only

    // ACK_UI_* and UI_RENDER_REPORT leave at most UI_REPLY_BURST per UI_REPLY_WINDOW_MS, then one per UI_REPLY_SPACING_MS,
    // acks first. The transmit queue is 8 deep and a dropped record forces a reconnect (which clears every slot), so a
    // burst of slot updates must not answer in a burst. Filled by the inbound-dispatch task, drained by the main task.
    struct DeferredUiAck
    {
        char type[24]; // type after "ACK_"
        uint32_t messageId;
    };
    // A contribution the reader skipped (status "skipped"); successful renders are not reported.
    struct UiRenderReport
    {
        uint32_t resourceId;
        uint32_t revision;
        char owner[65];
        char slot[28];
        char key[28];
        char reason[20];
    };
    static constexpr uint32_t UI_REPLY_SPACING_MS = 25;
    static constexpr uint8_t UI_ACK_QUEUE_MAX = 32;
    static constexpr uint8_t UI_REPORT_QUEUE_MAX = 4; // reports are advisory: never queued at an ack's expense
    static constexpr uint8_t UI_REPLY_BURST = 4;      // sent immediately per window, the rest paced
    static constexpr uint32_t UI_REPLY_WINDOW_MS = 100;
    portMUX_TYPE uiReplyLock = portMUX_INITIALIZER_UNLOCKED; // guards everything below

    // Card session id: set on the inbound-dispatch task (CARD_AUTHENTICATION_DATA), read on LvglTask (START, STOP,
    // UI_STEP_RESULT, CARD_SESSION_ENDED). Only touched through these helpers, which copy it under uiReplyLock.
    static constexpr size_t CARD_SESSION_ID_MAX = 24; // server ids are 16 base64url chars
    using CardSessionIdBuf = char[CARD_SESSION_ID_MAX + 1];
    CardSessionIdBuf cardSessionId = {};
    void setCardSessionId(const char *id); // null or empty clears; an id longer than the maximum clears too
    bool copyCardSessionId(CardSessionIdBuf &out); // false (and `out` empty) when there is none
    bool takeCardSessionId(CardSessionIdBuf &out); // copies and clears in one step
    DeferredUiAck uiAcks[UI_ACK_QUEUE_MAX];
    UiRenderReport uiReports[UI_REPORT_QUEUE_MAX];
    uint8_t uiAckHead = 0;
    uint8_t uiAckCount = 0;
    uint8_t uiReportHead = 0;
    uint8_t uiReportCount = 0;
    uint8_t uiReplyWindowCount = 0;
    uint32_t uiReplyLastMs = 0;
    uint32_t uiReplyWindowStartMs = 0;
    // True when the reply was queued instead of being due now (`report` null: an ack of `ackType`).
    bool deferUiReply(const char *ackType, uint32_t messageId, const UiRenderReport *report);
    // Takes the next queued reply once the spacing allows: 0 none, 1 `ack`, 2 `report`.
    int takeDueUiReply(DeferredUiAck &ack, UiRenderReport &report);
#ifdef ATTRACTAP_UI_SELFTEST
    std::mutex testInjectMutex;
    std::deque<std::string> testInjectQueue;
#endif
};
