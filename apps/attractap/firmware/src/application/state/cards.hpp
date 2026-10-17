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
struct ApiEnrollNewCardData_t
    {
        uint8_t keyNo;
        uint8_t keyBytes[16];
    };
#endif

#if defined(HAS_LVGL_DISPLAY)
ApiEnrollNewCardData_t apiEnrollNewCardData;
#endif

#if defined(HAS_LVGL_DISPLAY)
enum EnrollmentPhase_t
    {
        ENROLL_PHASE_NONE,
        ENROLL_PHASE_WAIT_FOR_CARD, // screen up, probing for a writable card
        ENROLL_PHASE_REQUESTED_KEY, // asked server for key material, awaiting it
        ENROLL_PHASE_WRITING,       // writing the key to the (still-present) card
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
volatile bool enrollKeyMaterialReady = false;
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
        uint8_t keyNo;
        uint8_t keyBytes[16];
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
        RESET_PHASE_WRITING,       // authenticating + writing the factory key back
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
uint32_t resetStartTimeMs = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t resetPhaseChangedMs = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t RESET_TIMEOUT_MS = 30000;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t RESET_SUCCESS_DWELL_MS = 1500;
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t RESET_ERROR_DWELL_MS = 1800;
#endif
};
