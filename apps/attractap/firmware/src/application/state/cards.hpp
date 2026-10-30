#pragma once
#include "../dependencies.hpp"

struct ApplicationCardsState
{
protected:
enum ExternalStates_t
    {
        EXTERNAL_STATE_NONE,
#ifdef HAS_LVGL_DISPLAY
        EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
        EXTERNAL_STATE_RESET_NFC_CARD,
#endif
        EXTERNAL_STATE_AUTHENTICATE_CARD,
        EXTERNAL_STATE_FIRMWARE_UPDATE,
    };

#if defined(HAS_LVGL_DISPLAY)
struct ApiEnrollNewCardGetAvailableKeyNoData_t
    {
        std::string username;
    };
#endif

#if defined(HAS_LVGL_DISPLAY)
ApiEnrollNewCardGetAvailableKeyNoData_t apiEnrollNewCardGetAvailableKeyNoData;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t apiEnrollNewCardGetAvailableKeyNoStartTimeMs;
#endif

#if defined(HAS_LVGL_DISPLAY)
enum EnrollmentPhase_t
    {
        ENROLL_PHASE_NONE,
        ENROLL_PHASE_WAIT_FOR_CARD, // screen up, probing for a writable card
        ENROLL_PHASE_WRITING,       // the server writes and proves the key through the relay
        ENROLL_PHASE_SUCCESS,       // success shown, dwelling before exit
        ENROLL_PHASE_ERROR,         // error shown, dwelling before retry
    };
#endif

#if defined(HAS_LVGL_DISPLAY)
EnrollmentPhase_t enrollPhase = ENROLL_PHASE_NONE;
#endif

#if defined(HAS_LVGL_DISPLAY)
volatile bool enrollCardDetected = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
// Set on the websocket task when the server confirmed the enrollment (the card proved its new key).
volatile bool enrollSucceeded = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
// UID of the card that entered the field; written by the detection callback on the main loop.
uint8_t enrollCardUid[10] = {0};
uint8_t enrollCardUidLength = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
volatile bool enrollCancelRequested = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
volatile bool enrollErrorPending = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
char enrollErrorMessage[64] = {0};
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t enrollPhaseChangedMs = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t ENROLL_SUCCESS_DWELL_MS = 1500;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t ENROLL_ERROR_DWELL_MS = 1800;
#endif

#if defined(HAS_LVGL_DISPLAY)
struct ApiResetNfcCardData_t
    {
        std::string username;
    };
#endif

#if defined(HAS_LVGL_DISPLAY)
ApiResetNfcCardData_t apiResetNfcCardData;
#endif

#if defined(HAS_LVGL_DISPLAY)
enum ResetPhase_t
    {
        RESET_PHASE_NONE,
        RESET_PHASE_WAIT_FOR_CARD, // screen up, waiting for a card to reset
        RESET_PHASE_WRITING,       // the server resets the card through the relay
        RESET_PHASE_SUCCESS,       // success shown, dwelling before exit
        RESET_PHASE_ERROR,         // error shown, dwelling before retry
    };
#endif

#if defined(HAS_LVGL_DISPLAY)
ResetPhase_t resetPhase = RESET_PHASE_NONE;
#endif

#if defined(HAS_LVGL_DISPLAY)
volatile bool resetCardDetected = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
volatile bool resetCancelRequested = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
// Set on the websocket task with the server's verdict on the reset.
volatile bool resetSucceeded = false;
volatile bool resetErrorPending = false;
char resetErrorMessage[64] = {0};
uint8_t resetCardUid[10] = {0};
uint8_t resetCardUidLength = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t resetStartTimeMs = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t resetPhaseChangedMs = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t RESET_TIMEOUT_MS = 30000;
#endif

#if defined(HAS_LVGL_DISPLAY)
// The server gives up on a card conversation after 15 s; the screen follows shortly after.
static constexpr uint32_t CARD_WRITE_TIMEOUT_MS = 20000;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t RESET_SUCCESS_DWELL_MS = 1500;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t RESET_ERROR_DWELL_MS = 1800;
#endif
};
