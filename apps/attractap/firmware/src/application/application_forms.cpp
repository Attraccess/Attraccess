// Resource usage form flow: paging cursor, field rendering, page submission
// FEATURE: application-form-flow

#include "application.hpp"

#ifdef HAS_LVGL_DISPLAY
void Application::handleFormsRequest(
    const API::ResourceUsageFormRequest &request) {
  // 'request' aliases this->pendingFormRequest (filled by the callback).
  (void)request;
  // The server retries un-acked messages (RETRY_COUNT in the gateway). A duplicate
  // RESOURCE_USAGE_FORM_REQUEST must not reset an in-progress form, nor reopen one
  // that was already submitted while the START/STOP result is in flight (ATT-545).
  if (this->hasPendingFormRequest || this->formFlowSubmitted) {
    return;
  }
  this->hasPendingFormRequest = true;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;
  Display::resourceDetailsScreen.hideActionProgress();
  Display::resourceDetailsScreen.showFormsModal(this->pendingFormRequest);
  this->requestCurrentFormField();
}

uint32_t Application::totalFormFields() const {
  uint32_t total = 0;
  for (uint8_t i = 0;
       i < this->pendingFormRequest.formCount && i < API::MAX_FORMS_PER_REQUEST;
       ++i) {
    total += this->pendingFormRequest.forms[i].fieldCount;
  }
  return total;
}

uint32_t Application::globalFormFieldNumber() const {
  uint32_t number = 0;
  for (uint8_t i = 0;
       i < this->formCursorFormIdx && i < API::MAX_FORMS_PER_REQUEST; ++i) {
    number += this->pendingFormRequest.forms[i].fieldCount;
  }
  return number + this->formCursorOffset + 1;
}

bool Application::isLastFormField() const {
  // Last when no later field exists in this or any subsequent form.
  if (this->formCursorFormIdx >= this->pendingFormRequest.formCount) {
    return true;
  }
  if (this->formCursorOffset + 1 <
      this->pendingFormRequest.forms[this->formCursorFormIdx].fieldCount) {
    return false;
  }
  for (uint8_t i = this->formCursorFormIdx + 1;
       i < this->pendingFormRequest.formCount && i < API::MAX_FORMS_PER_REQUEST;
       ++i) {
    if (this->pendingFormRequest.forms[i].fieldCount > 0) {
      return false;
    }
  }
  return true;
}

void Application::requestCurrentFormField() {
  // Skip forms that carry no fields, finish when the cursor runs past the end.
  while (this->formCursorFormIdx < this->pendingFormRequest.formCount &&
         this->pendingFormRequest.forms[this->formCursorFormIdx].fieldCount ==
             0) {
    this->formCursorFormIdx++;
    this->formCursorOffset = 0;
  }
  if (this->formCursorFormIdx >= this->pendingFormRequest.formCount) {
    this->finishFormFlow();
    return;
  }
  const API::ResourceUsageFormMeta &form =
      this->pendingFormRequest.forms[this->formCursorFormIdx];
  this->api.requestFormFields(this->pendingFormRequest.resourceId,
                              this->pendingFormRequest.action, form.id,
                              this->formCursorOffset, API::MAX_FORM_PAGE_FIELDS);
}

void Application::advanceFormCursor() {
  this->formCursorOffset += API::MAX_FORM_PAGE_FIELDS;
  if (this->formCursorFormIdx < this->pendingFormRequest.formCount &&
      this->formCursorOffset >=
          this->pendingFormRequest.forms[this->formCursorFormIdx].fieldCount) {
    this->formCursorFormIdx++;
    this->formCursorOffset = 0;
  }
}

void Application::retreatFormCursor() {
  if (this->formCursorOffset > 0) {
    this->formCursorOffset--;
  } else {
    if (this->formCursorFormIdx == 0) {
      return;
    }
    int16_t idx = static_cast<int16_t>(this->formCursorFormIdx) - 1;
    while (idx >= 0 && this->pendingFormRequest.forms[idx].fieldCount == 0) {
      idx--;
    }
    if (idx < 0) {
      return;
    }
    this->formCursorFormIdx = static_cast<uint8_t>(idx);
    this->formCursorOffset = this->pendingFormRequest.forms[idx].fieldCount - 1;
  }
  this->requestCurrentFormField();
}

void Application::handleFormFields(const API::ResourceUsageFormFieldsPage &page) {
  if (!this->hasPendingFormRequest) {
    return;
  }
  bool canGoBack = this->globalFormFieldNumber() > 1;
  Display::resourceDetailsScreen.renderFormField(
      page, canGoBack, this->isLastFormField(), this->globalFormFieldNumber(),
      this->totalFormFields());
}

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
  Display::resourceDetailsScreen.showActionProgress("Sende Formular");

  if (this->pendingActionType == PENDING_ACTION_START_SESSION) {
    this->api.startResourceUsageSession(this->pendingActionResourceId,
                                        this->pendingActionProjectId);
  } else if (this->pendingActionType == PENDING_ACTION_STOP_SESSION) {
    this->api.stopResourceUsageSession(this->pendingActionResourceId);
  } else {
    this->handleFormsCancel();
  }
}

void Application::handleFormsCancel() {
  if (!this->hasPendingFormRequest) {
    return;
  }
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = false;
  this->pendingActionType = PENDING_ACTION_NONE;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;
  Display::resourceDetailsScreen.hideFormsModal();
  Display::resourceDetailsScreen.hideActionProgress();
  this->endActionPause();
}

void Application::onActionResult(const String &eventType) {
  if (eventType == "START_RESOURCE_USAGE_SESSION" ||
      eventType == "STOP_RESOURCE_USAGE_SESSION") {
    this->pendingActionType = PENDING_ACTION_NONE;
    this->hasPendingFormRequest = false;
    this->formFlowSubmitted = false;
    Display::resourceDetailsScreen.hideFormsModal();
  }
}
#endif
