#pragma once

// Reader UI state held by the API object (ATT-1187): step and slot callbacks, the card session id and scratch
// space for inbound UI messages. Kept out of api.hpp to stay under the file size limit.

#include <deque>
#include <functional>
#include <string>
#ifdef ATTRACTAP_UI_SELFTEST
#include <mutex>
#endif

#include "../display/ui/ui_step.hpp"

struct ApiUiState
{
protected:
    // Step callbacks run on the inbound-dispatch task; the application hands over to LvglTask.
    std::function<void(const ui::StepRequest &)> uiStepRequestCallback;
    std::function<void(const std::string &stepId)> uiStepCancelCallback;
    std::function<void()> uiSlotsChangedCallback;
    std::string cardSessionId;
    ui::StepRequest uiStepScratch;
    void *uiSlotScratch = nullptr; // ui::SlotRecord in PSRAM, display readers only

    // ACK_UI_* and UI_RENDER_REPORT leave at most UI_REPLY_BURST per UI_REPLY_WINDOW_MS, then one per UI_REPLY_SPACING_MS. The transmit queue is 8 deep and a
    // dropped record forces a reconnect (which clears every slot), so a burst of slot updates must not answer in a burst.
    struct DeferredUiReply
    {
        std::string type;
        std::string payloadJson;
        uint32_t messageId;
    };
    static constexpr uint32_t UI_REPLY_SPACING_MS = 25;
    static constexpr size_t UI_REPLY_QUEUE_MAX = 64;
    std::deque<DeferredUiReply> uiReplies;
    static constexpr uint8_t UI_REPLY_BURST = 4;      // sent immediately per window, the rest paced
    static constexpr uint32_t UI_REPLY_WINDOW_MS = 100;
    uint32_t uiReplyLastMs = 0;
    uint32_t uiReplyWindowStartMs = 0;
    uint8_t uiReplyWindowCount = 0;
    bool uiReplyFlushing = false;
#ifdef ATTRACTAP_UI_SELFTEST
    std::mutex testInjectMutex;
    std::deque<std::string> testInjectQueue;
#endif
};
