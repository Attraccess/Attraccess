#pragma once

#include <string>

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../../utils.hpp"
#include "../../images/logo_400w_png.hpp"

// Card reset/deletion screen. Visually + behaviourally mirrors EnrollmentScreen
// (ATT-503): sticky until success/cancel/timeout, explicit high-contrast white
// text, phase-driven status line, prominent username, styled countdown bar and
// a cancel button — so the two card-management flows feel consistent (ATT-506).
class ResetScreen : public IScreen
{
public:
    ResetScreen() : logger("ResetScreen") {}
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    // Visual phase of the reset flow. Drives the status line text + color so the
    // user always knows what the reader is doing.
    enum Status
    {
        STATUS_WAITING, // hold the card on the reader
        STATUS_WRITING, // resetting the key, hold still
        STATUS_SUCCESS, // card reset
        STATUS_ERROR,   // something went wrong
    };

    void setTimeoutTime(uint32_t timeoutTime);
    void setUserName(std::string userName);
    void setStatus(Status status);
    // Override the status line text (used for specific error messages). Cleared
    // automatically on the next setStatus() call that isn't STATUS_ERROR.
    void setStatusMessage(const std::string &message);
    void setOnCancelCallback(std::function<void()> callback);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;

    lv_obj_t *timeoutBar = nullptr;
    lv_obj_t *userNameLabel = nullptr;
    lv_obj_t *statusLabel = nullptr;
    lv_obj_t *cancelButton = nullptr;
    std::string userNameCache;
    std::string statusMessageOverride;
    Status status = STATUS_WAITING;

    std::function<void()> onCancelCallback;
    static void onCancelButtonEvent(lv_event_t *e);

    uint32_t timeoutTime = 0;
    void updateTimeoutBar();
    void applyStatus();
};
