#pragma once

// Reader UI state held by the API object (ATT-1187): step and slot callbacks, the card session id and scratch
// space for inbound UI messages. Kept out of api.hpp to stay under the file size limit.

#include <functional>
#include <string>
#ifdef ATTRACTAP_UI_SELFTEST
#include <deque>
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
#ifdef ATTRACTAP_UI_SELFTEST
    std::mutex testInjectMutex;
    std::deque<std::string> testInjectQueue;
#endif
};
