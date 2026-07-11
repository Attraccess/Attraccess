#pragma once

#include <functional>

#include <string>

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../../utils.hpp"

// Two-card supervision screen (ATT-493). Shown after a non-introduced user taps at a resource that
// requires supervision. Visually mirrors EnrollmentScreen/ResetScreen (ATT-506): sticky until
// success/cancel/timeout, high-contrast text, phase-driven status line, prominent requester name,
// a styled 30s countdown bar and a cancel button.
//
// It tells the user to either place a tutor's card on the reader OR have the tutor approve from
// their phone/PC — the same pending request is resolved by whichever channel acts first.
class SupervisionScreen : public IScreen
{
public:
    SupervisionScreen() : logger("SupervisionScreen") {}
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    enum Status
    {
        STATUS_WAITING,   // place the tutor card, or approve via web
        STATUS_VERIFYING, // tutor card read, verifying / starting session
        STATUS_SUCCESS,   // approved, session started
        STATUS_ERROR,     // something went wrong (e.g. card not authorised)
    };

    void setTimeoutTime(uint32_t timeoutTime);
    void setRequesterName(std::string requesterName);
    void setStatus(Status status);
    // Override the status line text (used for specific error messages). Cleared automatically on the
    // next setStatus() call that isn't STATUS_ERROR.
    void setStatusMessage(const std::string &message);
    // Secondary hint listing who may approve (tutor names) plus the web fallback note.
    void setSupervisorHint(const std::string &hint);
    void setOnCancelCallback(std::function<void()> callback);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;

    lv_obj_t *timeoutBar = nullptr;
    lv_obj_t *requesterNameLabel = nullptr;
    lv_obj_t *statusLabel = nullptr;
    lv_obj_t *hintLabel = nullptr;
    lv_obj_t *cancelButton = nullptr;
    std::string requesterNameCache;
    std::string statusMessageOverride;
    std::string hintCache;
    Status status = STATUS_WAITING;

    std::function<void()> onCancelCallback;
    static void onCancelButtonEvent(lv_event_t *e);

    uint32_t timeoutTime = 0;
    void updateTimeoutBar();
    void applyStatus();
};
