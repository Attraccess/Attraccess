// Resource usage form flow: paging cursor, field rendering, page submission
// FEATURE: application-form-flow

#include "application.hpp"
#include <string>

#ifdef HAS_LVGL_DISPLAY
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

  // Serve from cache when available (instant); otherwise fetch and wait.
  FormPageCacheEntry *cached =
      this->findFormPageCache(form.id, this->formCursorOffset);
  if (cached) {
    this->awaitingFieldRender = false;
    this->renderFormFieldPage(cached->page);
    this->prefetchNextFormField();
    return;
  }

  this->awaitingFieldRender = true;
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
#endif
