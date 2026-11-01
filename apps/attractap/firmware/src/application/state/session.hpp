#pragma once
#include "../dependencies.hpp"
#include "runtime.hpp"
#include <atomic>

struct ApplicationSessionState : protected ApplicationRuntimeState
{
protected:
#if defined(HAS_LVGL_DISPLAY)
std::atomic<bool> sessionSummaryActive{false};
bool sessionSummaryVisible = false;
std::atomic<bool> sessionSummaryDismissRequested{false};
uint32_t sessionSummaryShownAt = 0;
uint32_t sessionSummaryTouchSequence = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t timeOfUnlockedMs;
#endif

#if defined(HAS_LVGL_DISPLAY)
const uint32_t UNLOCKED_TIMEOUT_MS = 30000;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t timeOfResourceSelectionMs;
#endif

#if defined(HAS_LVGL_DISPLAY)
const uint32_t RESOURCE_SELECTION_TIMEOUT_MS = 10000;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint8_t resourceCount = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool resourceIsSelected = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool returnToListAfterAction = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool waitingForResourceRefresh = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t resourceRefreshRequestId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
    FirmwareI18n::Text actionCompletionMessage;
    std::string completedResourceName;
    // The billing total screen already answers the action; the completion screen must not replace it.
    bool billingSummaryShown = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
// What routing depends on. A status screen the application raised keeps routing
// from replacing it for as long as this is unchanged.
struct RoutingKey
{
    applicationState_t state;
    bool unlocked;
    bool resourceIsSelected;
    uint32_t selectedResourceId;
    bool operator==(const RoutingKey &) const = default;
};
bool statusHeld = false;
RoutingKey statusHoldKey{};
// Leaving a status screen without a screen to return to: route from the state again.
bool rerouteRequested = false;
// A top-up request was sent; only its refusal reopens the top-up screen.
bool topUpPending = false;
// A usage-form page was submitted and its result is outstanding.
bool formPageSubmitPending = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool cardAuthenticationPending = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t cardAuthenticationStartedAt = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t authenticationResourceId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
std::string pendingUiAction;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t pendingUiResourceId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t pendingUiStartedAt = 0;
#endif

#if !(defined(HAS_LVGL_DISPLAY))
bool resourceIsDoor = false;
#endif

uint32_t selectedResourceId = 0;

#if !defined(HAS_LVGL_DISPLAY)
bool cardDetected = false;
#endif

#if !defined(HAS_LVGL_DISPLAY)
bool cardRemoved = false;
#endif

#if !defined(HAS_LVGL_DISPLAY)
unsigned long cardDetectionTimeMs = 0;
#endif

#if !defined(HAS_LVGL_DISPLAY)
bool cardPresentationWasLong = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool selectedResourceChanged = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
API::ResourceList resourceList;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool resourceListUpdated = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
API::ProjectsOfUserResponse projectsOfUserResponse;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool projectsOfUserResponseUpdated = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t selectedProjectId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
std::string selectedProjectName;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t projectsCurrentPage = 1;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t projectsTotalCount = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool projectsHasMore = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
std::string currentProjectsUser;
#endif
};
