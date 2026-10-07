#pragma once
#include "application_dependencies.hpp"
#include "application_cards_state.hpp"

struct ApplicationRuntimeState : protected ApplicationCardsState
{
protected:
ExternalStates_t externalState = EXTERNAL_STATE_NONE;

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint32_t ENROLLMENT_TIMEOUT_MS = 30000;
#endif

#if defined(DEMO_MODE)
volatile bool demoPendingScanActive = false;
#endif

#if defined(DEMO_MODE)
volatile bool demoPendingScanReady = false;
#endif

#if defined(DEMO_MODE)
std::string demoScanUid;
#endif

API::CardAuthenticationDetailsResponse cardAuthenticationData;

int firmwareUpdateProgressPct = 0;

std::string availableFirmwareVersion;

struct BootDiagnostics_t
    {
        uint32_t magic;
        uint8_t resetReason;
        uint32_t uptimeMs;
        uint32_t freeInternalHeap;
        uint32_t largestFreeBlock;
        bool websocketConnected;
        bool wifiConnected;
    };

KVStore bootDiagPreferences;

uint32_t lastBootSnapshotMs = 0;

#if defined(HAS_LVGL_DISPLAY)
uint32_t bootTime;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool bootDone = false;
#endif

bool unlocked = false;

enum applicationState_t
    {
#ifdef HAS_LVGL_DISPLAY
        APPLICATION_STATE_BOOT,
        APPLICATION_STATE_PIN_NOT_SET,
#endif
        APPLICATION_STATE_CONFIGURATION_REQUIRED,
        APPLICATION_STATE_INIT,
        APPLICATION_STATE_CUSTOM,
#ifdef HAS_LVGL_DISPLAY
        APPLICATION_STATE_LOCKED,
#endif
        APPLICATION_STATE_AUTHENTICATE_CARD,
        APPLICATION_STATE_NO_RESOURCES,
#ifdef HAS_LVGL_DISPLAY
        APPLICATION_STATE_RESOURCE_LIST,
        APPLICATION_STATE_RESOURCE_LIST_AUTHENTICATED,
        APPLICATION_STATE_UNLOCKED,
        APPLICATION_STATE_ENROLLMENT,
        APPLICATION_STATE_RESET,
        APPLICATION_STATE_SUPERVISION,
#else
        APPLICATION_STATE_WAIT_FOR_CARD,
#endif
        APPLICATION_STATE_FIRMWARE_UPDATE
    };

#if defined(HAS_LVGL_DISPLAY)
applicationState_t state = APPLICATION_STATE_BOOT;
#endif

#if !(defined(HAS_LVGL_DISPLAY))
applicationState_t state = APPLICATION_STATE_INIT;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t pauseStartMs = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t accumulatedPauseMs = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint16_t actionInProgressCount = 0;
#endif
};
