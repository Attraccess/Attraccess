// Resource usage form flow: paging cursor, field rendering, page submission
// FEATURE: application-form-flow

#include "application.hpp"
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::handleFormPageNext(const API::FormPageSubmission &page) {
  if (!this->hasPendingFormRequest) {
    return;
  }
  this->api.submitFormPage(this->pendingFormRequest.resourceId,
                           this->pendingFormRequest.action, page);
}

void Application::handleFormPageResult(
    const API::ResourceUsageFormPageResult &result) {
  if (!this->hasPendingFormRequest) {
    return;
  }
  if (result.valid) {
    // The submitted field's draft value changed server-side; drop its cached copy
    // so navigating back re-fetches the persisted answer instead of a stale one.
    this->invalidateFormPageCache(result.formId, result.offset);
    this->advanceFormCursor();
    this->requestCurrentFormField();
  } else {
    Display::resourceDetailsScreen.showFormPageErrors(result);
  }
}

void Application::handleFormPageBack() {
  if (!this->hasPendingFormRequest) {
    return;
  }
  this->retreatFormCursor();
}

void Application::finishFormFlow() {
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = true;
  Display::resourceDetailsScreen.hideFormsModal();
  this->pendingUiStartedAt = millis();
  this->showReaderActionProgress("Sende Formular");

  if (this->pendingActionType == PENDING_ACTION_START_SESSION) {
    this->api.startResourceUsageSession(this->pendingActionResourceId,
                                        this->pendingActionProjectId, this->pendingActionIsTakeover);
  } else if (this->pendingActionType == PENDING_ACTION_STOP_SESSION) {
    this->api.stopResourceUsageSession(this->pendingActionResourceId);
  } else {
    this->handleFormsCancel();
  }
}

void Application::handleFormsCancel() {
  if (this->hasPendingServerFormFlow) {
    this->api.cancelForm(this->pendingFormRequestResourceId,
                         this->pendingFormRequestAction);
  } else if (this->pendingActionType != PENDING_ACTION_NONE) {
    // A form request may still be waiting for the LVGL callback. Cancel against
    // the action identity now so its server-side draft cannot survive locally
    // clearing the pending action.
    API::ResourceUsageFormActionType action =
        API::ResourceUsageFormActionType::UNKNOWN;
    if (this->pendingActionType == PENDING_ACTION_START_SESSION) {
      action = this->pendingActionIsTakeover
                   ? API::ResourceUsageFormActionType::TAKEOVER
                   : API::ResourceUsageFormActionType::START;
    } else if (this->pendingActionType == PENDING_ACTION_STOP_SESSION) {
      action = API::ResourceUsageFormActionType::END;
    }
    if (action != API::ResourceUsageFormActionType::UNKNOWN) {
      this->api.cancelForm(this->pendingActionResourceId, action);
    }
  }
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = false;
  this->pendingActionType = PENDING_ACTION_NONE;
  this->pendingActionResourceId = 0;
  this->pendingActionProjectId = 0;
  this->pendingActionIsTakeover = false;
  this->hasPendingServerFormFlow = false;
  this->pendingFormRequestResourceId = 0;
  this->pendingFormRequestAction = API::ResourceUsageFormActionType::UNKNOWN;
  this->pendingFormFieldsReady = false;
  this->pendingFormPageResultReady = false;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;
  this->clearFormPageCache();
  this->awaitingFieldRender = false;
  Display::resourceDetailsScreen.hideFormsModal();
  if (!this->waitingForResourceRefresh) Display::resourceDetailsScreen.hideActionProgress();
  this->finishReaderAction(false);
  if (!this->waitingForResourceRefresh) this->endActionPause();
}
#endif
