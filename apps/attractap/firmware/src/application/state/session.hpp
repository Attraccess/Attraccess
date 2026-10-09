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
std::string actionCompletionMessage;
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
