// Resource usage form flow: paging cursor, field rendering, page submission
// FEATURE: application-form-flow

#include "application.hpp"
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::handleFormsRequest(
    const API::ResourceUsageFormRequest &request) {
  // The server retries un-acked messages (RETRY_COUNT in the gateway). A duplicate
  // RESOURCE_USAGE_FORM_REQUEST must not reset an in-progress form, nor reopen one
  // that was already submitted while the START/STOP result is in flight (ATT-545).
  API::ResourceUsageFormActionType expectedAction =
      API::ResourceUsageFormActionType::UNKNOWN;
  if (this->pendingActionType == PENDING_ACTION_START_SESSION) {
    expectedAction = this->pendingActionIsTakeover
                         ? API::ResourceUsageFormActionType::TAKEOVER
                         : API::ResourceUsageFormActionType::START;
  } else if (this->pendingActionType == PENDING_ACTION_STOP_SESSION) {
    expectedAction = API::ResourceUsageFormActionType::END;
  }
  if (!this->api.isCurrentResourceAction(request.requestId) || this->hasPendingFormRequest || this->formFlowSubmitted ||
      this->pendingActionType == PENDING_ACTION_NONE ||
      request.resourceId != this->pendingActionResourceId ||
      request.action != expectedAction) {
    return;
  }
  // This runs on the LVGL thread, which owns all pending-action state.
  this->pendingFormRequest = request;
  this->pendingFormRequestResourceId = request.resourceId;
  this->pendingFormRequestAction = request.action;
  this->hasPendingServerFormFlow = true;
  this->hasPendingFormRequest = true;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;
  this->clearFormPageCache();
  this->awaitingFieldRender = false;
  if (this->returnToListAfterAction) {
    this->resourceIsSelected = true;
    this->state = APPLICATION_STATE_UNLOCKED;
    Display::resourceListScreen.hideActionProgress();
    Display::transitionToScreen(&Display::resourceDetailsScreen);
  }
  Display::resourceDetailsScreen.hideActionProgress();
  Display::resourceDetailsScreen.showFormsModal(this->pendingFormRequest);
  this->requestCurrentFormField();
}


void Application::handleFormFields(const API::ResourceUsageFormFieldsPage &page) {
  if (!this->hasPendingFormRequest) {
    return;
  }

  // Always cache the page (covers both the awaited current field and prefetched
  // neighbours). renderFormFieldPage reads from the stable cache slot, never the
  // shared scratch buffer, so the displayed page survives later prefetch traffic.
  FormPageCacheEntry *entry = this->storeFormPageCache(page);
  if (!entry) {
    return;
  }

  // Render only when this page is the one the user is actually waiting on.
  if (this->awaitingFieldRender &&
      this->formCursorFormIdx < this->pendingFormRequest.formCount) {
    uint32_t currentFormId =
        this->pendingFormRequest.forms[this->formCursorFormIdx].id;
    if (page.formId == currentFormId && page.offset == this->formCursorOffset) {
      this->awaitingFieldRender = false;
      this->renderFormFieldPage(entry->page);
      this->prefetchNextFormField();
    }
  }
}


void Application::onActionResult(const std::string &eventType) {
  if (eventType == "START_RESOURCE_USAGE_SESSION" ||
      eventType == "STOP_RESOURCE_USAGE_SESSION") {
    this->pendingActionType = PENDING_ACTION_NONE;
    this->hasPendingFormRequest = false;
    this->hasPendingServerFormFlow = false;
    this->formFlowSubmitted = false;
    Display::resourceDetailsScreen.hideFormsModal();
  }
}

#endif
