#pragma once
#include "../dependencies.hpp"
#include "session.hpp"

struct ApplicationFormsState : protected ApplicationSessionState
{
protected:
#if defined(HAS_LVGL_DISPLAY)
enum pending_action_t
    {
        PENDING_ACTION_NONE,
        PENDING_ACTION_START_SESSION,
        PENDING_ACTION_STOP_SESSION,
    };
#endif

#if defined(HAS_LVGL_DISPLAY)
pending_action_t pendingActionType = PENDING_ACTION_NONE;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t pendingActionResourceId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t pendingActionProjectId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool pendingActionIsTakeover = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool hasPendingFormRequest = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool formFlowSubmitted = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool hasPendingServerFormFlow = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t pendingFormRequestResourceId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
API::ResourceUsageFormActionType pendingFormRequestAction =
        API::ResourceUsageFormActionType::UNKNOWN;
#endif

#if defined(HAS_LVGL_DISPLAY)
volatile bool pendingFormFieldsReady = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
volatile bool pendingFormPageResultReady = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
API::ResourceUsageFormRequest pendingFormRequest;
#endif

#if defined(HAS_LVGL_DISPLAY)
API::ResourceUsageFormFieldsPage pendingFormFields;
#endif

#if defined(HAS_LVGL_DISPLAY)
API::ResourceUsageFormPageResult pendingFormPageResult;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint8_t formCursorFormIdx = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t formCursorOffset = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
struct FormPageCacheEntry {
      bool valid = false;
      uint32_t formId = 0;
      uint32_t offset = 0;
      uint32_t lru = 0;
      API::ResourceUsageFormFieldsPage page;
    };
#endif

#if defined(HAS_LVGL_DISPLAY)
static constexpr uint8_t FORM_PAGE_CACHE_SIZE = 4;
#endif

#if defined(HAS_LVGL_DISPLAY)
FormPageCacheEntry formPageCache[FORM_PAGE_CACHE_SIZE];
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t formCacheTick = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
bool awaitingFieldRender = false;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t usageStatsResourceId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t usageStatsUsageId = 0;
#endif

#if defined(HAS_LVGL_DISPLAY)
uint32_t usageStatsRequestedAt = 0;
#endif
};
